const { Jimp } = require('jimp');
const fs = require('fs');
const path = require('path');

// Read command-line arguments
const args = process.argv.slice(2);

// Check if image directory, output spritesheet name, and output text file name are provided
if (args.length < 3) {
    console.error('Error: Both image directory and output file names must be provided as command-line arguments.');
    console.error('Usage: node combined_atlas_generator.js <image_directory_path> <output_spritesheet_name> <output_text_file_name> [prepend_path]');
    process.exit(1);
}

const inputImageDirectory = args[0];
const outputSpritesheetName = args[1];
const outputTextFileName = args[2];
const prependPath = args[3] ? args[3].replace(/\\/g, '/') + '/' : '';

const imageDirectory = path.join(__dirname, inputImageDirectory);
const outputSpritesheetPath = path.join(__dirname, outputSpritesheetName);
const outputTextFilePath = path.join(__dirname, outputTextFileName);

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
 * Asynchronously creates a spritesheet and a corresponding text file from images found in a specified directory.
 */
async function createSpritesheetAndTextFile() {
    try {
        const imageFiles = await getImageFilesRecursively(imageDirectory);

        if (imageFiles.length === 0) {
            console.log('No image files found in the specified directory or its subdirectories.');
            return;
        }

        imageFiles.sort();

        console.log(`Found ${imageFiles.length} image(s).`);

        const images = [];
        let maxWidth = 0;
        let totalHeight = 0;
        const imageData = []; // To store path and dimensions for each image

        for (const imagePath of imageFiles) {
            try {
                const image = await loadImage(imagePath);
                images.push(image);

                const dimensions = { width: image.bitmap.width, height: image.bitmap.height };
                imageData.push({ path: imagePath, ...dimensions });

                maxWidth = Math.max(maxWidth, dimensions.width);
                totalHeight += dimensions.height;
            } catch (error) {
                console.error(error.message);
                throw new Error('Process aborted due to image loading/dimension errors.');
            }
        }

        // 1. Create the spritesheet image
        const spritesheet = await new Jimp({ width: maxWidth, height: totalHeight, color: 0x00000000 });
        let yOffset = 0;

        for (const image of images) {
            spritesheet.composite(image, 0, yOffset);
            yOffset += image.bitmap.height;
        }

        await spritesheet.write(outputSpritesheetPath);
        console.log(`Spritesheet created successfully at: ${outputSpritesheetPath}`);

        // 2. Generate the atlas text file
        let outputContent = '';
        outputContent += `${path.basename(outputSpritesheetName)}\n`;
        outputContent += `size: ${maxWidth}, ${totalHeight}\n`;
        outputContent += `format: RGBA8888\n`;
        outputContent += `filter: MipMapLinearLinear, MipMapLinearLinear\n`;
        outputContent += `repeat: none\n`;

        yOffset = 0; // Reset yOffset for text file generation

        for (const img of imageData) {
            const relativePathWithExtension = path.relative(imageDirectory, img.path).replace(/\\/g, '/');
            const relativePathWithoutExtension = relativePathWithExtension.substring(0, relativePathWithExtension.lastIndexOf('.'));
            outputContent += `${prependPath}${relativePathWithoutExtension}\n`;
            outputContent += `  rotate: false\n`;
            outputContent += `  xy: 0, ${yOffset}\n`;
            outputContent += `  size: ${img.width}, ${img.height}\n`;
            outputContent += `  orig: ${img.width}, ${img.height}\n`;
            outputContent += `  offset: 0, 0\n`;
            outputContent += `  index: -1\n`;
            yOffset += img.height;
        }

        await fs.promises.writeFile(outputTextFilePath, outputContent);
        console.log(`Atlas text file created successfully at: ${outputTextFilePath}`);

    } catch (error) {
        console.error('Error in combined script:', error.message);
        process.exit(1);
    }
}

createSpritesheetAndTextFile();
