const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const {program} = require('commander');

// Define command line options with sensible default values
program
    .option('-i, --input <path>', 'Input directory containing PNG images', 'input')
    .option('-o, --output <path>', 'Output directory for processed images', 'output')
    .option('-f, --frame <path>', 'Frame image file path', 'frame.png')
    .option('-l, --left <number>', 'Left position for placing the image on the frame', "50")
    .option('-t, --top <number>', 'Top position for placing the image on the frame', "50");

program.parse(process.argv);
const options = program.opts();

// Resolve paths based on the provided command line options
const inputDir = path.resolve(options.input);
const outputDir = path.resolve(options.output);
const framePath = path.resolve(options.frame);
const position = {left: parseInt(options.left), top: parseInt(options.top)};

console.log(inputDir, outputDir, framePath, position);

(async () => {
    try {
        // Ensure the output directory exists
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, {recursive: true});
        }

        // Read all PNG files from the input directory
        const files = fs.readdirSync(inputDir).filter(file =>
            path.extname(file).toLowerCase() === '.png'
        );

        if (files.length === 0) {
            console.log('No PNG files found in the input directory.');
            return;
        }

        // Process each file: composite the input image onto the frame image
        for (const file of files) {
            const inputImagePath = path.join(inputDir, file);
            const outputImagePath = path.join(outputDir, file);

            await sharp(framePath)
                .composite([{input: inputImagePath, left: position.left, top: position.top}])
                .toFile(outputImagePath);

            console.log(`Processed ${file}`);
        }

        console.log('All images have been processed successfully.');
    } catch (error) {
        console.error('An error occurred:', error);
    }
})();
