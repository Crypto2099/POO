const {Command, InvalidArgumentError} = require('commander');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const querystring = require('querystring');
const qrcode = require('qrcode');
const {Buffer} = require("buffer");
const {QRCodeCanvas} = require('@loskir/styled-qr-code-node');
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
    .option('-l, --lovelace <int>', 'Number of Lovelace to attach to each code', intArg, 1000000)
    .option('-t, --tokens "[policy_id].[asset_id][#?]|[quantity],[policy_id].[asset_id][#?]|[quantity]"', 'Provide details of a token that will be added to each code. Assets should be provided in hex-based format i.e. (698a6ea0ca99f315034072af31eaac6ec11fe8558d3f48e9775aab9d.7444524950) If a number symbol (#) is present at the end of the asset ID, a serial number will be added to the end of each asset. Add a pipe character (|) followed by the integer amount of the token to send.', null, false)
    .option('-o, --offset <int>', "How much to offset token number generation by.")
    .description('Generate [amount] of random codes and save to a local text file')
    .action((amount, options) => {
        console.log(`Generating ${parseInt(amount)} codes!`);
        let offset = options.offset || 0;
        console.log(`Offset: ${offset}`);
        if (options.uuid) {
            console.log(`Using UUIDv4`);
        } else {
            console.log(`Using hex strings of ${options.bytes} random bytes.`)
        }
        console.log(`Codes will be written out to: ./codes.json`);
        const codes = {};
        for (let i = 0; i < parseInt(amount); i++) {
            let code;
            if (options.uuid) {
                code = crypto.randomUUID();
            } else {
                code = crypto.randomBytes(options.bytes).toString('hex');
            }

            const code_contents = {
                lovelaces: options.lovelace
            };

            if (options.tokens) {
                const tokens = options.tokens.split(',');

                if (tokens) {
                    tokens.forEach((token) => {
                        const [asset, quantity] = token.split('|');
                        let [policy_id, asset_id] = asset.split('.');
                        if (asset_id.slice(-1) === '#') {
                            const serial = parseInt(i) + parseInt(offset) + 1;
                            console.log(`Serial #${serial}`);
                            asset_id = asset_id.substring(0, asset_id.length - 1) + serial.toString().padStart(amount.toString().length, '0');
                            asset_id = Buffer.from(asset_id, "ascii").toString('hex');
                        }
                        code_contents[policy_id + "." + asset_id] = quantity;
                    });
                }
            }

            codes[code] = code_contents
        }

        fs.writeFileSync('./codes.json', JSON.stringify(codes));
        console.log('Finished!');
    });

program
    .command('generate-qr')
    .argument('<faucet_url>', 'The faucet URL that will be embedded into the QR code')
    .argument('[code_source]', 'JSON file containing the codes to generate. The file format should be a JSON array with each code being a new entry in the array.', './codes.json')
    .option('-o, --output <path>', 'The output path to store generated QR Codes in', './qr')
    .option('-f, --format <type>', "The output format", "svg")
    .option('-u, --uri', 'Generate URIs only and write them to a file')
    .option('-e, --ecl <level>', 'Error-correction Level: L, M, Q, H', 'H')
    .option('-w, --width <int>', 'Size of the generated code', intArg, 512)
    .option('-d, --dark <rgba>', 'Hex RGBA color code for dark portions of the QR code', '#000000ff')
    .option('-l, --light <rgba>', 'Hex RGBA color code for light portions of the QR code', '#ffffffff')
    .option('-m, --margin <int>', 'Size of the margin to place around the image', intArg, 0)
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

        const uris = [];

        Object.keys(codes).forEach((code) => {
            const uri = 'web+cardano://claim/v1?' + querystring.stringify({
                faucet_url: faucet_url,
                code: code
            });

            uris.push(uri);

            qrcode.toFile(path.join(options.output, code + '.' + options.format), uri, {
                errorCorrectionLevel: options.ecl,
                width: options.width,
                margin: options.margin,
                color: {
                    dark: options.dark,
                    light: options.light
                }
            })
        });

        fs.writeFileSync(path.join(options.output, 'code_uris.json'), JSON.stringify(uris));
    })

program
    .command('generate-claim-qr')
    .argument('[code_source]', 'JSON file containing the codes to generate. The file format should be a JSON object with each code being the keys of the object.', './codes.json')
    .option('-o, --output <path>', 'The output path to store the generated QR codes in', './claim_qr')
    .option('-f, --format <type>', 'The output format (SVG|PNG)', 'svg')
    .option('-u, --uri', 'Generate URIs only and write them to a file')
    .option('-e, --ecl <level>', 'Error-correction Level: L, M, Q, H', 'H')
    .option('-w, --width <int>', 'Size of the generated code', intArg, 512)
    .option('-d, --dark <rgba>', 'Hex RGBA color code for dark portions of the QR code', '#000000ff')
    .option('-l, --light <rgba>', 'Hex RGBA color code for light portions of the QR code', '#ffffffff')
    .description('Generate QR codes for NMKR claim from the provided JSON codes file')
    .action((code_source, options) => {
        // console.log(faucet_url, querystring.escape(faucet_url));
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

        const uris = [];


        const width = options.width;
        const height = width;

        const config = {
            data: null, // This is the URL
            // image: null, // This is a URI to the image to layer over the center
            label: null, // This is a label shown beneath the QR
            width: width,
            height: height,
            margin: 0,
            type: "svg",
            qrOptions: {
                typeNumber: 0, mode: "Byte", errorCorrectionLevel: options.ecl
            },
            dotsOptions: {
                type: "rounded", // type: "extra-rounded",
                color: options.dark,
                // gradient: {
                //     "type": "linear",
                //     "rotation": -0.7853981633974483,
                //     "colorStops": [{"offset": 0, "color": "#fdf64b"}, {"offset": 1, "color": "#02c9ee"}]
                // }
            },
            cornersDotOptions: {
                type: "dot",
                color: options.dark,
            },
            cornersSquareOptions: {
                type: "rounded",
                color: options.dark,
            },
            backgroundOptions: {
                color: options.light
            },
            imageOptions: {
                margin: 10, crossOrigin: 'anonymous', saveAsBlob: true
            }
        };

        Object.keys(codes).forEach((code) => {
            // https://nmkr.io/claim?coupon=
            const uri = 'https://nmkr.io/claim?' + querystring.stringify({
                coupon: code
            });

            uris.push(uri);

            config.data = uri;

            const qr_code = new QRCodeCanvas(config);
            qr_code.toFile(path.join(options.output, code + '.' + options.format), options.format);
            config.data = null;
        });
    })

program.parse();