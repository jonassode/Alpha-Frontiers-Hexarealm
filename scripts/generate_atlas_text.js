const fs = require('fs');
const path = require('path');
const { Jimp } = require('jimp'); // Jimp is still needed to get image dimensions

// Read command-line arguments
const args = process.argv.slice(2);

// Check if image directory and output file name are provided
if (args.length < 2) {
    console.error('Error: Both image directory and output file name must be provided as command-line arguments.');
    console.error('Usage: node generate_atlas_text.js <image_directory_path> <output_text_file_name> [prepend_path]');
    console.error('The third optional argument specifies a path to prepend to each image entry in the output text file.');
    process.exit(1); // Exit with an error code
}

const inputImageDirectory = args[0];
const outputFileName = args[1];
// The output image reference name is now derived from the outputFileName
const outputImageReferenceName = path.basename(outputFileName, path.extname(outputFileName)) + '.png'; 
// Optional third argument for a path to prepend to each image entry
const prependPath = args[2] ? args[2].replace(/\\/g, '/') + '/' : ''; // Standardize slashes and add trailing slash if present

// Define the directory where your source images are located.
const imageDirectory = path.join(__dirname, inputImageDirectory);
// Construct the full path for the output text file.
const outputFilePath = path.join(__dirname, outputFileName);

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
 * Attempts to read an image file using Jimp to get its dimensions.
 * @param {string} imagePath - Path to the image file
 * @returns {Promise<{width: number, height: number}>} The dimensions of the image
 * @throws {Error} If the image cannot be loaded
 */
async function getImageDimensions(imagePath) {
    try {
        const image = await Jimp.read(imagePath);
        return { width: image.bitmap.width, height: image.bitmap.height };
    } catch (error) {
        throw new Error(`Failed to get dimensions for image at ${imagePath}: ${error.message}`);
    }
}

/**
 * Asynchronously generates a text file containing image information for a sprite atlas.
 */
async function generateAtlasTextFile() {
    try {
        // Read all image files recursively from the image directory
        const imageFiles = await getImageFilesRecursively(imageDirectory);

        // If no image files are found, log a message and exit
        if (imageFiles.length === 0) {
            console.log('No image files found in the specified directory or its subdirectories.');
            return;
        }

        // Sort the image file paths alphabetically to ensure a consistent order
        imageFiles.sort();

        console.log(`Found ${imageFiles.length} image(s):`, imageFiles);

        let maxWidth = 0;
        let totalHeight = 0;
        const imageData = []; // To store path and dimensions for each image

        // Loop through each image file to get its dimensions
        for (const imagePath of imageFiles) {
            try {
                const dimensions = await getImageDimensions(imagePath);
                imageData.push({ path: imagePath, ...dimensions });

                maxWidth = Math.max(maxWidth, dimensions.width);
                totalHeight += dimensions.height;
            } catch (error) {
                console.error(error.message);
                throw new Error('Atlas text file generation aborted due to image dimension errors');
            }
        }

        let outputContent = '';

        // Header for the text file
        outputContent += `${outputImageReferenceName}\n`;
        outputContent += `size: ${maxWidth}, ${totalHeight}\n`;
        outputContent += `format: RGBA8888\n`;
        outputContent += `filter: MipMapLinearLinear, MipMapLinearLinear\n`;
        outputContent += `repeat: none\n`;

        let yOffset = 0; // Tracks the current Y position for each image in the atlas

        // Add information for each image
        for (const img of imageData) {
            // Get the relative path from the imageDirectory, standardize slashes, and then remove the extension
            const relativePathWithExtension = path.relative(imageDirectory, img.path).replace(/\\/g, '/');
            const relativePathWithoutExtension = relativePathWithExtension.substring(0, relativePathWithExtension.lastIndexOf('.'));
            outputContent += `${prependPath}${relativePathWithoutExtension}\n`; // Prepend the new parameter here
            outputContent += `  rotate: false\n`;
            outputContent += `  xy: 0, ${yOffset}\n`;
            outputContent += `  size: ${img.width}, ${img.height}\n`;
            outputContent += `  orig: ${img.width}, ${img.height}\n`;
            outputContent += `  offset: 0, 0\n`;
            outputContent += `  index: -1\n`;
            yOffset += img.height;
        }

        // Save the final text file
        await fs.promises.writeFile(outputFilePath, outputContent);
        console.log(`Atlas text file created successfully at: ${outputFilePath}`);

    } catch (error) {
        // Catch and log any errors that occur during the process
        console.error('Error generating atlas text file:', error.message);
        process.exit(1); // Exit with error code
    }
}

// Call the main function to start the process
generateAtlasTextFile();
