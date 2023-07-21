# POO QR Code Generator

This is a quick and easy utility for generating randomized codes and subsequent QR codes that can then be uploaded to
your POO API server and printed and attached to your physical handouts as part of your POO Deployment.

## How to Use?

### 1. Clone the repo to your local machine

Clone this repo to your local machine

### 2. Navigate to the QR Generator directory

Enter the cloned repository and navigate to the `packages/qr-generator` folder.

### 3. Install dependencies

Install the needed dependencies by running `npm install`

### 4. Generate codes

#### 4a. Bring Your Own Codes

If you already have codes, you can create a `codes.json` file in the local directory and insert them there. The format
of the file is a simple JSON array containing a new code for each entry.

**codes.json Example:**
```json
[
  "code1",
  "code2",
  "...",
  "code69",
  "...",
  "code420"
]
```

#### 4b. Generate New Codes

If you want to test this out or do not already have codes, there's a script for that!

##### generate-codes command

```shell
$~/POO/packages/qr-generator> node index.js help generate-codes

Usage: index.js generate-codes [options] [amount]

Generate [amount] of random codes and save to a local text file

Arguments:
  amount             Number of codes you wish to generate (default: 10)

Options:
  -u, --uuid         Generate UUID codes (default: false)
  -b, --bytes <int>  Length of random bytes codes generated (default: 8)
  -h, --help         display help for command

```

You can choose to use random UUIDv4 codes or codes of the specified byte-length which will be converted into their hex
encoding by specifying either the -u or -b options. By default 8-byte hex string codes will be used if no other options
are specified.

**Examples**

Generate 10 codes as 8-byte length hex strings
```shell
node index.js generate-codes
```

Generate 100 codes as 16-byte length hex strings
```shell
node index.js generate-codes -b 16 100
```

Generate 27 codes as random UUIDv4 codes
```shell
node index.js generate-codes -u 27
```

### 5. Generate QR Codes

#### generate-qr command

```shell
> node index.js help generate-qr
Usage: index.js generate-qr [options] <faucet_url> [code_source]

Generate SVG QR codes from the provided JSON codes file

Arguments:
  faucet_url           The faucet URL that will be embedded into the QR code
  code_source          JSON file containing the codes to generate. The file format should be a JSON array with each code being a new entry in the array. (default: "./codes.json")

Options:
  -o, --output <path>  The output path to store generated QR Codes in (default: "./qr")
  -e, --ecl <level>    Error-correction Level: L, M, Q, H (default: "H")
  -w, --width <int>    Size (pixel width) of the generated code (default: 512)
  -d, --dark <rgba>    Hex RGBA color code for dark portions of the QR code (default: "#000000ff")
  -l, --light <rgba>   Hex RGBA color code for light portions of the QR code (default: "#ffffffff")
  -h, --help           display help for command
```

This command by default will create SVG QR codes following the POO URI standard (`web+cardano://claim/v1...`). The
required `faucet_url` will be added as a query argument and a new QR code will be generated for each code provided via
the option `code_source` (defaults to `./codes.json`).

One or more of the options may be specified in order to control the output.

**Examples**

Generate QR codes from the local `codes.json` file, output using default options to the local `./qr` directory.
```shell
node index.js generate-qr https://claim.hosky.io
```

Generate QR codes from a non-local codes file.
```shell
node index.js generate-qr https://claim.hosky.io /home/user/codes.json
```

Generate QR codes from the local `codes.json` file, output to a non-local directory. _Note: Make sure the directory exists!_
```shell
node index.js generate-qr https://claim.hosky.io -o /home/user/edinburgh23/qr/
```

Generate QR codes that are 2048 pixels square with a blue-on-yellow color scheme
```shell
node index.js generate-qr https://claim.hosky.io -w 2048 -d '#0000ffff' -l '#ffff00ff'
```