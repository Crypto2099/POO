const { Command, InvalidArgumentError } = require('commander');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const querystring = require('querystring');
const qrcode = require('qrcode');
const program = new Command();

function intArg(value, prev) {
    const parsedValue = parseInt(value, 10);
    if (isNaN(parsedValue)) {
        throw new InvalidArgumentError('Must be an integer value.');
    }
    return parsedValue;
}

program
    .name('index.js')
    .description(`A simple CLI utility to generate random codes and QR images from them`)
    .version('1.0.0');
program
    .command('generate-codes')
    .argument('[amount]', 'Number of codes you wish to generate', intArg, 10)
    .option('-u, --uuid', 'Generate UUID codes', false)
    .option('-b, --bytes <int>', 'Length of random bytes codes generated', intArg, 8)
    .description('Generate [amount] of random codes and save to a local text file')
    .action((amount, options) => {
        console.log(`Generating ${parseInt(amount)} codes!`);
        if (options.uuid) {
            console.log(`Using UUIDv4`);
        } else {
            console.log(`Using hex strings of ${options.bytes} random bytes.`)
        }
        console.log(`Codes will be written out to: ./codes.json`);
        const codes = [];
        for (let i = 0; i < parseInt(amount); i++) {
            let code;
            if (options.uuid) {
                code = crypto.randomUUID();
            } else {
                code = crypto.randomBytes(options.bytes).toString('hex');
            }

            // console.log("Step:", i, code);
            codes.push(code);
        }

        fs.writeFileSync('./codes.json', JSON.stringify(codes));
        console.log('Finished!');
    });

program
    .command('generate-qr')
    .argument('<faucet_url>', 'The faucet URL that will be embedded into the QR code')
    .argument('[code_source]', 'JSON file containing the codes to generate. The file format should be a JSON array with each code being a new entry in the array.', './codes.json')
    .option('-o, --output <path>', 'The output path to store generated QR Codes in', './qr')
    .option('-e, --ecl <level>', 'Error-correction Level: L, M, Q, H', 'H')
    .option('-w, --width <int>', 'Size of the generated code', intArg, 512)
    .option('-d, --dark <rgba>', 'Hex RGBA color code for dark portions of the QR code', '#000000ff')
    .option('-l, --light <rgba>', 'Hex RGBA color code for light portions of the QR code', '#ffffffff')
    .description('Generate SVG QR codes from the provided JSON codes file')
    .action((faucet_url, code_source, options) => {
        console.log(faucet_url, querystring.escape(faucet_url));
        console.log(code_source);
        console.log(options);

        // Create the output directory if it does not exist
        if (!fs.existsSync(options.output)) {
            console.log("Creating the output directory...");
            fs.mkdirSync(options.output);
        }

        // Empty the output directory
        const files = fs.readdirSync(options.output);
        for (const file of files) {
            fs.unlinkSync(path.join(options.output, file))
        }

        let codes;

        try {
            codes = JSON.parse(fs.readFileSync(code_source, 'utf8'));
        } catch (e) {
            console.error(e);
            throw new Error("Could not read the codes file! Are you sure it is valid JSON?");
        }

        for (const code of codes) {
            const uri = 'web+cardano://claim/v1?'+querystring.stringify({
                faucet_url: faucet_url,
                code: code
            });

            qrcode.toFile(path.join(options.output, code+'.svg'), uri, {
                errorCorrectionLevel: options.ecl,
                width: options.width,
                color: {
                    dark: options.dark,
                    light: options.light
                }
            })
        }
    })

program.parse();