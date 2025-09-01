const { Jimp } = require('jimp');
const fs = require('fs');
const path = require('path');

// Read command-line arguments
const args = process.argv.slice(2);

// Check if image directory, output spritesheet name, and output text file name are provided
if (args.length < 3) {
    console.error('Error: Both image directory and output file names must be provided as command-line arguments.');
    console.error('Usage: node generate_atlas_files.js <image_directory_path> <output_spritesheet_name> <output_text_file_name> [prepend_path]');
    process.exit(1);
}

const inputImageDirectory = args[0];
const outputSpritesheetName = args[1];
const outputTextFileName = args[2];
const prependPath = args[3] ? args[3].replace(/\\/g, '/') + '/' : '';

const imageDirectory = path.join(__dirname, inputImageDirectory);
const outputSpritesheetPath = path.join(__dirname, outputSpritesheetName);
const outputTextFilePath = path.join(__dirname, outputTextFileName);

// Recommended spritesheet size, typically a power of 2 for better GPU performance
const MAX_DIMENSION = 4096;

/**
 * Recursively gets all image files from a directory and its subdirectories
 * @param {string} dir - The directory to scan
 * @returns {Promise<string[]>} Array of image file paths
 */
async function getImageFilesRecursively(dir) {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    const files = await Promise.all(entries.map(async entry => {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            return getImageFilesRecursively(fullPath);
        } else {
            const ext = path.extname(entry.name).toLowerCase();
            if (['.png', '.jpg', '.jpeg', '.bmp', '.gif'].includes(ext)) {
                return [fullPath];
            }
            return [];
        }
    }));
    return files.flat();
}

/**
 * Attempts to read an image file using Jimp
 * @param {string} imagePath - Path to the image file
 * @returns {Promise<Jimp>} The loaded Jimp image
 * @throws {Error} If the image cannot be loaded
 */
async function loadImage(imagePath) {
    try {
        return await Jimp.read(imagePath);
    } catch (error) {
        throw new Error(`Failed to load image at ${imagePath}: ${error.message}`);
    }
}

/**
 * Packs images into a spritesheet using a simple shelf-packing algorithm.
 * @param {Array} images - An array of image data objects { path, width, height, JimpInstance }
 * @returns {{packedImages: Array, width: number, height: number}} The packed image data and spritesheet dimensions
 * @throws {Error} If any image is too large to fit in the spritesheet
 */
function packImages(images) {
    // Sort images by height in descending order to pack larger ones first
    images.sort((a, b) => b.height - a.height);

    let currentX = 0;
    let currentY = 0;
    let currentRowHeight = 0;
    let packedWidth = 0;
    let packedHeight = 0;

    const packedImages = [];

    for (const img of images) {
        // Check if the image fits in the current row
        if (currentX + img.width > MAX_DIMENSION) {
            // Move to the next row
            currentX = 0;
            currentY += currentRowHeight;
            currentRowHeight = 0;
        }

        // Check if the image fits in the overall spritesheet
        if (currentY + img.height > MAX_DIMENSION) {
            throw new Error(`Image "${path.basename(img.path)}" (${img.width}x${img.height}) is too large to fit in the spritesheet.`);
        }

        // Place the image
        packedImages.push({
            ...img,
            x: currentX,
            y: currentY
        });

        // Update coordinates and row height
        currentX += img.width;
        currentRowHeight = Math.max(currentRowHeight, img.height);
        packedWidth = Math.max(packedWidth, currentX);
    }

    packedHeight = currentY + currentRowHeight;

    return {
        packedImages,
        width: packedWidth,
        height: packedHeight
    };
}

/**
 * Asynchronously creates a spritesheet and a corresponding text file from images found in a specified directory.
 */
async function createSpritesheetAndTextFile() {
    try {
        const imageFiles = await getImageFilesRecursively(imageDirectory);

        if (imageFiles.length === 0) {
            console.log('No image files found in the specified directory or its subdirectories.');
            return;
        }

        console.log(`Found ${imageFiles.length} image(s).`);

        const images = [];
        for (const imagePath of imageFiles) {
            try {
                const image = await loadImage(imagePath);
                images.push({
                    path: imagePath,
                    width: image.bitmap.width,
                    height: image.bitmap.height,
                    JimpInstance: image
                });
            } catch (error) {
                console.error(error.message);
                throw new Error('Process aborted due to image loading errors.');
            }
        }

        // 1. Pack the images
        const { packedImages, width, height } = packImages(images);

        // 2. Create the spritesheet image with calculated dimensions
        const spritesheet = await new Jimp({ width, height, color: 0x00000000 });

        for (const img of packedImages) {
            spritesheet.composite(img.JimpInstance, img.x, img.y);
        }

        await spritesheet.write(outputSpritesheetPath);
        console.log(`Spritesheet created successfully at: ${outputSpritesheetPath}`);

        // 3. Generate the atlas text file
        let outputContent = '';
        outputContent += `${path.basename(outputSpritesheetName)}\n`;
        outputContent += `size: ${width}, ${height}\n`;
        outputContent += `format: RGBA8888\n`;
        outputContent += `filter: MipMapLinearLinear, MipMapLinearLinear\n`;
        outputContent += `repeat: none\n`;

        for (const img of packedImages) {
            const relativePathWithExtension = path.relative(imageDirectory, img.path).replace(/\\/g, '/');
            const relativePathWithoutExtension = relativePathWithExtension.substring(0, relativePathWithExtension.lastIndexOf('.'));
            outputContent += `${prependPath}${relativePathWithoutExtension}\n`;
            outputContent += `  rotate: false\n`;
            outputContent += `  xy: ${img.x}, ${img.y}\n`; // Use packed coordinates
            outputContent += `  size: ${img.width}, ${img.height}\n`;
            outputContent += `  orig: ${img.width}, ${img.height}\n`;
            outputContent += `  offset: 0, 0\n`;
            outputContent += `  index: -1\n`;
        }

        await fs.promises.writeFile(outputTextFilePath, outputContent);
        console.log(`Atlas text file created successfully at: ${outputTextFilePath}`);

    } catch (error) {
        console.error('Error in combined script:', error.message);
        process.exit(1);
    }
}

createSpritesheetAndTextFile();
