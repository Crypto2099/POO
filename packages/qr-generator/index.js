const {Command, InvalidArgumentError} = require('commander');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const querystring = require('querystring');
const qrcode = require('qrcode');
const sharp = require('sharp');
const {parse} = require('csv-parse/sync');

const program = new Command();

// -------------------------
// Unit helpers
// -------------------------
function inchesToPx(inches, dpi) {
    return Math.round(inches * dpi);
}

function mmToPx(mm, dpi) {
    return Math.round((mm / 25.4) * dpi);
}

// -------------------------
// Safe XML text
// -------------------------
function escapeXml(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// -------------------------
// Normalize QR SVG: strip xml/doctype, remove width/height, set size
// -------------------------
function normalizeQrSvg(qrSvg, sizePx) {
    let s = qrSvg
        .replace(/^\s*<\?xml[\s\S]*?\?>/i, '')
        .replace(/^\s*<!DOCTYPE[\s\S]*?>/i, '')
        .trim();

    s = s.replace(/\swidth="[^"]*"/i, '').replace(/\sheight="[^"]*"/i, '');

    if (!/preserveAspectRatio=/i.test(s)) {
        s = s.replace(/<svg/i, `<svg preserveAspectRatio="xMidYMid meet"`);
    }

    // ensure width/height are present
    s = s.replace(/<svg/i, `<svg width="${sizePx}" height="${sizePx}"`);

    return s;
}

// -------------------------
// Write out SVG or PNG with DPI metadata
// -------------------------
async function writeOut({svg, outPath, format, dpi = 203}) {
    const f = String(format || 'svg').toLowerCase();
    if (f === 'png') {
        await sharp(Buffer.from(svg))
            .png({compressionLevel: 9})
            .withMetadata({density: dpi})
            .toFile(outPath);
    } else {
        fs.writeFileSync(outPath, svg, 'utf8');
    }
}

// -------------------------
// Logo helpers
// -------------------------
function mimeFromPath(p) {
    const ext = String(path.extname(p)).toLowerCase();
    if (ext === '.png') return 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.svg') return 'image/svg+xml';
    return 'application/octet-stream';
}

function toDataUri(filePath) {
    const mime = mimeFromPath(filePath);
    const buf = fs.readFileSync(filePath);
    const b64 = buf.toString('base64');
    return `data:${mime};base64,${b64}`;
}

function injectCenterImageIntoQrSvg(qrSvg, {
    imageHref,
    scale = 0.22,
    bg = '#ffffffff'
}) {
    const vbMatch = /viewBox="([\d.\-e]+)\s+([\d.\-e]+)\s+([\d.\-e]+)\s+([\d.\-e]+)"/i.exec(qrSvg);
    if (!vbMatch) return qrSvg;

    const vx = Number(vbMatch[1]);
    const vy = Number(vbMatch[2]);
    const vw = Number(vbMatch[3]);
    const vh = Number(vbMatch[4]);

    const size = Math.min(vw, vh) * scale;
    const x = vx + (vw - size) / 2;
    const y = vy + (vh - size) / 2;

    const pad = size * 0.12;
    const bgX = x - pad;
    const bgY = y - pad;
    const bgW = size + pad * 2;
    const bgH = size + pad * 2;
    const r = Math.min(bgW, bgH) * 0.12;

    const overlay = `
  <g id="qr-center-image">
    <rect x="${bgX}" y="${bgY}" width="${bgW}" height="${bgH}" rx="${r}" ry="${r}" fill="${bg}"/>
    <image href="${imageHref}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/>
  </g>`;

    return qrSvg.replace(/<\/svg>\s*$/i, `${overlay}\n</svg>`);
}

// -------------------------
// QR generation helper
// -------------------------
async function makeQrSvg({data, ecl, width, margin, dark, light}) {
    return await qrcode.toString(data, {
        type: 'svg',
        errorCorrectionLevel: ecl,
        width,
        margin,
        color: {dark, light}
    });
}

// -------------------------
// Sticker sizing + layout
// -------------------------
function parseSizePair(s) {
    // accepts "1x1", "2.5x1.25", "25x25"
    const m = String(s || '').trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)$/);
    if (!m) return null;
    return {a: parseFloat(m[1]), b: parseFloat(m[2])};
}

function computeStickerPx(options) {
    const dpi = Number(options.dpi || 203);

    // Primary: --sticker (inches), e.g. 1x1
    if (options.sticker) {
        const p = parseSizePair(options.sticker);
        if (!p) throw new Error(`Invalid --sticker "${options.sticker}". Use WxH like 2x1`);
        return {
            dpi,
            stickerWpx: inchesToPx(p.a, dpi),
            stickerHpx: inchesToPx(p.b, dpi)
        };
    }

    // Secondary: --sticker-mm, e.g. 25x25
    if (options.stickerMm) {
        const p = parseSizePair(options.stickerMm);
        if (!p) throw new Error(`Invalid --sticker-mm "${options.stickerMm}". Use WxH like 50x30`);
        return {
            dpi,
            stickerWpx: mmToPx(p.a, dpi),
            stickerHpx: mmToPx(p.b, dpi)
        };
    }

    // No sticker size provided
    return {dpi, stickerWpx: null, stickerHpx: null};
}

function clampInt(n, min, max) {
    const x = Math.floor(Number(n));
    if (!Number.isFinite(x)) return min;
    return Math.min(max, Math.max(min, x));
}

function buildStickerLayoutSvg({
                                   stickerWpx,
                                   stickerHpx,
                                   qrSvg,
                                   headerText,
                                   footerText,
                                   fontSizePx,
                                   textGapPx,
                                   outerMarginPx,
                                   bg
                               }) {
    // Text metrics (simple & reliable for thermal printing)
    const lineH = Math.ceil(fontSizePx * 1.35);

    const hasHeader = !!(headerText && String(headerText).trim());
    const hasFooter = !!(footerText && String(footerText).trim());

    const headerH = hasHeader ? lineH : 0;
    const footerH = hasFooter ? lineH : 0;

    const gapAboveQr = hasHeader ? textGapPx : 0;
    const gapBelowQr = hasFooter ? textGapPx : 0;

    const usableW = stickerWpx - 2 * outerMarginPx;
    const usableH = stickerHpx - 2 * outerMarginPx - headerH - footerH - gapAboveQr - gapBelowQr;

    const qrSize = Math.max(1, Math.min(usableW, usableH));

    // Center horizontally within sticker
    const qrX = outerMarginPx + Math.floor((usableW - qrSize) / 2);

    // Stack vertically: margin -> header -> gap -> QR -> gap -> footer -> margin
    const headerY = outerMarginPx + fontSizePx; // baseline
    const qrY = outerMarginPx + headerH + gapAboveQr;
    const footerY = qrY + qrSize + gapBelowQr + fontSizePx; // baseline

    const nestedQr = normalizeQrSvg(qrSvg, qrSize);

    return `
<svg xmlns="http://www.w3.org/2000/svg"
     width="${stickerWpx}" height="${stickerHpx}"
     viewBox="0 0 ${stickerWpx} ${stickerHpx}">
  <rect width="100%" height="100%" fill="${bg}"/>

  ${hasHeader ? `
  <text x="${stickerWpx / 2}" y="${headerY}" text-anchor="middle"
        font-family="system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
        font-size="${fontSizePx}" fill="#000" dominant-baseline="alphabetic">
    ${escapeXml(headerText)}
  </text>` : ''}

  <g transform="translate(${qrX}, ${qrY})">
    ${nestedQr}
  </g>

  ${hasFooter ? `
  <text x="${stickerWpx / 2}" y="${footerY}" text-anchor="middle"
        font-family="system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
        font-size="${fontSizePx}" fill="#000" dominant-baseline="alphabetic">
    ${escapeXml(footerText)}
  </text>` : ''}

</svg>`.trim();
}

// -------------------------
// Commander helpers
// -------------------------
function intArg(value) {
    const parsedValue = parseInt(value, 10);
    if (isNaN(parsedValue)) throw new InvalidArgumentError('Must be an integer value.');
    return parsedValue;
}

function addStickerOptions(cmd) {
    return cmd
        .option('--dpi <int>', 'Printer DPI (used for sticker sizing + PNG metadata)', intArg, 203)
        .option('--sticker <WxH>', 'Sticker size in inches, e.g. 1x1, 2x1, 3x2', null)
        .option('--sticker-mm <WxH>', 'Sticker size in mm, e.g. 25x25, 50x30', null)
        .option('--outer-margin <px>', 'Inner margin inside sticker canvas (px)', intArg, 8)
        .option('--text-gap <px>', 'Gap between text and QR (px)', intArg, 10)
        .option('--font-size <px>', 'Font size for header/footer text (px)', intArg, 18)
        .option('--expires <text>', 'Optional expiration/header text above the QR', null)
        .option('--show-code', 'Include the code value below the QR', false)
        .option('--logo <path d="">', 'Optional center logo image (png/jpg/svg)', null)
        .option('--logo-scale <float>', 'Logo size relative to QR width (e.g. 0.22 = 22%)', parseFloat, 0.22);
}

async function renderQrToStickerOrFallback({
                                               data,
                                               codeValue,
                                               options,
                                               qrDark,
                                               qrLight
                                           }) {
    const {dpi, stickerWpx, stickerHpx} = computeStickerPx(options);

    const outerMarginPx = clampInt(options.outerMargin, 0, 10_000);
    const textGapPx = clampInt(options.textGap, 0, 10_000);
    const fontSizePx = clampInt(options.fontSize, 6, 200);

    const headerText = options.expires || null;
    const footerText = options.showCode ? String(codeValue) : null;

    // If sticker size is provided: make a sticker canvas and maximize QR
    if (stickerWpx && stickerHpx) {
        // First, we need a QR SVG. Its internal viewBox isn't sticker-dependent; we resize when embedding.
        // We can set width roughly = min(stickerW, stickerH) initially; it doesn't matter much since we normalize later.
        let qrSvg = await makeQrSvg({
            data,
            ecl: options.ecl || 'H',
            width: Math.min(stickerWpx, stickerHpx),
            margin: options.margin ?? 0,
            dark: qrDark,
            light: qrLight
        });

        if (options.logo) {
            const href = toDataUri(options.logo);
            qrSvg = injectCenterImageIntoQrSvg(qrSvg, {
                imageHref: href,
                scale: options.logoScale,
                bg: qrLight
            });
        }

        const svg = buildStickerLayoutSvg({
            stickerWpx,
            stickerHpx,
            qrSvg,
            headerText,
            footerText,
            fontSizePx,
            textGapPx,
            outerMarginPx,
            bg: qrLight
        });

        return {svg, dpi};
    }

    // Fallback behavior (no sticker size): preserve your original width output,
    // but still allow header/footer by making a "computed canvas" based on QR + text.
    const qrSize = Number(options.width || 512);

    let qrSvg = await makeQrSvg({
        data,
        ecl: options.ecl || 'H',
        width: qrSize,
        margin: options.margin ?? 0,
        dark: qrDark,
        light: qrLight
    });

    if (options.logo) {
        const href = toDataUri(options.logo);
        qrSvg = injectCenterImageIntoQrSvg(qrSvg, {
            imageHref: href,
            scale: options.logoScale,
            bg: qrLight
        });
    }

    // Make a canvas that fits QR + optional text (simple)
    const lineH = Math.ceil(fontSizePx * 1.35);
    const hasHeader = !!(headerText && String(headerText).trim());
    const hasFooter = !!(footerText && String(footerText).trim());
    const h = qrSize + (hasHeader ? (textGapPx + lineH) : 0) + (hasFooter ? (textGapPx + lineH) : 0);

    const nested = normalizeQrSvg(qrSvg, qrSize);
    const headerY = hasHeader ? fontSizePx : 0;
    const qrY = (hasHeader ? (textGapPx + lineH) : 0);
    const footerY = hasFooter ? (qrY + qrSize + textGapPx + fontSizePx) : 0;

    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${qrSize}" height="${h}" viewBox="0 0 ${qrSize} ${h}">
  <rect width="100%" height="100%" fill="${qrLight}"/>
  ${hasHeader ? `
  <text x="${qrSize / 2}" y="${headerY}" text-anchor="middle"
        font-family="system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
        font-size="${fontSizePx}" fill="#000" dominant-baseline="alphabetic">
    ${escapeXml(headerText)}
  </text>` : ''}
  <g transform="translate(0, ${qrY})">${nested}</g>
  ${hasFooter ? `
  <text x="${qrSize / 2}" y="${footerY}" text-anchor="middle"
        font-family="system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
        font-size="${fontSizePx}" fill="#000" dominant-baseline="alphabetic">
    ${escapeXml(footerText)}
  </text>` : ''}
</svg>`.trim();

    return {svg, dpi};
}

// -------------------------
// CLI
// -------------------------
program
    .name('index.js')
    .description('A simple CLI utility to generate random codes and QR images from them')
    .version('1.0.0');

program
    .command('generate-codes')
    .argument('[amount]', 'Number of codes you wish to generate', intArg, 10)
    .option('-f, --out <path d="">', 'The output path to store generated codes in', './codes.json')
    .option('-u, --uuid', 'Generate UUID codes', false)
    .option('-b, --bytes <int>', 'Length of random bytes codes generated', intArg, 8)
    .option('-l, --lovelace <int>', 'Number of Lovelace to attach to each code', intArg, 1000000)
    .option('-t, --tokens "[policy_id].[asset_id][#?]|[quantity],[policy_id].[asset_id][#?]|[quantity]"',
        'Provide details of a token that will be added to each code.',
        null,
        false
    )
    .option('-o, --offset <int>', 'How much to offset token number generation by.')
    .description('Generate [amount] of random codes and save to a local text file')
    .action((amount, options) => {
        console.log(`Generating ${parseInt(amount)} codes!`);
        let offset = options.offset || 0;
        console.log(`Offset: ${offset}`);
        console.log(options.uuid ? 'Using UUIDv4' : `Using hex strings of ${options.bytes} random bytes.`);
        console.log(`Codes will be written out to: ${options.out}`);

        const codes = {};
        for (let i = 0; i < parseInt(amount); i++) {
            let code = options.uuid
                ? crypto.randomUUID()
                : crypto.randomBytes(options.bytes).toString('hex');

            const code_contents = {lovelaces: options.lovelace};

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
                            asset_id = Buffer.from(asset_id, 'ascii').toString('hex');
                        }
                        code_contents[policy_id + '.' + asset_id] = quantity;
                    });
                }
            }

            codes[code] = code_contents;
        }

        fs.writeFileSync(options.out || './codes.json', JSON.stringify(codes));
        console.log('Finished!');
    });

// -------------------------
// generate-qr (sticker-aware)
// -------------------------
addStickerOptions(
    program
        .command('generate-qr')
        .argument('<faucet_url>', 'The faucet URL that will be embedded into the QR code')
        .argument('[code_source]', 'JSON file containing the codes to generate.', './codes.json')
        .option('-o, --output <path d="">', 'The output path to store generated QR Codes in', './qr')
        .option('-f, --format <type>', 'The output format (svg|png)', 'svg')
        .option('-u, --uri', 'Generate URIs only and write them to a file')
        .option('-e, --ecl <level>', 'Error-correction Level: L, M, Q, H', 'H')
        .option('-w, --width <int>', 'Fallback QR size in px when no sticker size provided', intArg, 512)
        .option('-d, --dark <rgba>', 'Hex RGBA color for dark modules', '#000000ff')
        .option('-l, --light <rgba>', 'Hex RGBA color for background', '#ffffffff')
        .option('-m, --margin <int>', 'Quiet zone margin', intArg, 0)
        .description('Generate QR codes from the provided JSON codes file, sized for sticker printing')
).action(async (faucet_url, code_source, options) => {
    if (!fs.existsSync(options.output)) fs.mkdirSync(options.output, {recursive: true});
    for (const f of fs.readdirSync(options.output)) fs.unlinkSync(path.join(options.output, f));

    let codes;
    try {
        codes = JSON.parse(fs.readFileSync(code_source, 'utf8'));
    } catch (e) {
        console.error(e);
        throw new Error('Could not read the codes file! Are you sure it is valid JSON?');
    }

    const uris = [];

    for (const code of Object.keys(codes)) {
        const uri = 'web+cardano://claim/v1?' + querystring.stringify({
            faucet_url: faucet_url,
            code: code
        });

        uris.push(uri);
        if (options.uri) continue;

        const {svg, dpi} = await renderQrToStickerOrFallback({
            data: uri,
            codeValue: code,
            options,
            qrDark: options.dark,
            qrLight: options.light
        });

        const outPath = path.join(options.output, `${code}.${options.format}`);
        await writeOut({svg, outPath, format: options.format, dpi});
    }

    fs.writeFileSync(path.join(options.output, 'code_uris.json'), JSON.stringify(uris, null, 2), 'utf8');
});

// -------------------------
// generate-event-qr (sticker-aware)
// -------------------------
addStickerOptions(
    program
        .command('generate-event-qr')
        .argument('<faucet_url>', 'The faucet URL prefix that will be embedded into the QR code')
        .argument('[code_source]', 'JSON file containing the codes to generate.', './codes.json')
        .option('-o, --output <path d="">', 'The output path to store generated QR Codes in', './qr')
        .option('-f, --format <type>', 'The output format (svg|png)', 'svg')
        .option('-u, --uri', 'Generate URIs only and write them to a file')
        .option('-e, --ecl <level>', 'Error-correction Level: L, M, Q, H', 'H')
        .option('-w, --width <int>', 'Fallback QR size in px when no sticker size provided', intArg, 512)
        .option('-d, --dark <rgba>', 'Hex RGBA color for dark modules', '#000000ff')
        .option('-l, --light <rgba>', 'Hex RGBA color for background', '#ffffffff')
        .option('-m, --margin <int>', 'Quiet zone margin', intArg, 0)
        .description('Generate event QR codes sized for sticker printing')
).action(async (faucet_url, code_source, options) => {
    if (!fs.existsSync(options.output)) fs.mkdirSync(options.output, {recursive: true});
    for (const f of fs.readdirSync(options.output)) fs.unlinkSync(path.join(options.output, f));

    let codes;
    try {
        codes = JSON.parse(fs.readFileSync(code_source, 'utf8'));
    } catch (e) {
        console.error(e);
        throw new Error('Could not read the codes file! Are you sure it is valid JSON?');
    }

    const uris = [];

    for (const code of Object.keys(codes)) {
        const uri = `${faucet_url}${code}`;
        uris.push(uri);
        if (options.uri) continue;

        const {svg, dpi} = await renderQrToStickerOrFallback({
            data: uri,
            codeValue: code,
            options,
            qrDark: options.dark,
            qrLight: options.light
        });

        const outPath = path.join(options.output, `${code}.${options.format}`);
        await writeOut({svg, outPath, format: options.format, dpi});
    }

    fs.writeFileSync(path.join(options.output, 'code_uris.json'), JSON.stringify(uris, null, 2), 'utf8');
});

// -------------------------
// generate-claim-qr (sticker-aware; plain squares)
// -------------------------
addStickerOptions(
    program
        .command('generate-claim-qr')
        .argument('[code_source]', 'JSON file containing the codes to generate (codes as object keys).', './codes.json')
        .option('-o, --output <path d="">', 'The output path to store the generated QR codes in', './claim_qr')
        .option('-f, --format <type>', 'The output format (svg|png)', 'svg')
        .option('-u, --uri', 'Generate URIs only and write them to a file')
        .option('-e, --ecl <level>', 'Error-correction Level: L, M, Q, H', 'H')
        .option('-w, --width <int>', 'Fallback QR size in px when no sticker size provided', intArg, 512)
        .option('-d, --dark <rgba>', 'Hex RGBA color for dark modules', '#000000ff')
        .option('-l, --light <rgba>', 'Hex RGBA color for background', '#ffffffff')
        .option('-m, --margin <int>', 'Quiet zone margin', intArg, 0)
        .description('Generate QR codes for NMKR claim, sized for sticker printing (thermal-friendly squares)')
).action(async (code_source, options) => {
    if (!fs.existsSync(options.output)) fs.mkdirSync(options.output, {recursive: true});
    for (const f of fs.readdirSync(options.output)) fs.unlinkSync(path.join(options.output, f));

    let codes;
    try {
        codes = JSON.parse(fs.readFileSync(code_source, 'utf8'));
    } catch (e) {
        console.error(e);
        throw new Error('Could not read the codes file! Are you sure it is valid JSON?');
    }

    const uris = [];

    for (const code of Object.keys(codes)) {
        const uri = 'https://nmkr.io/claim?' + querystring.stringify({coupon: code});
        uris.push(uri);
        if (options.uri) continue;

        const {svg, dpi} = await renderQrToStickerOrFallback({
            data: uri,
            codeValue: code,
            options,
            qrDark: options.dark,
            qrLight: options.light
        });

        const outPath = path.join(options.output, `${code}.${options.format}`);
        await writeOut({svg, outPath, format: options.format, dpi});
    }

    fs.writeFileSync(path.join(options.output, 'uris.json'), JSON.stringify(uris, null, 2), 'utf8');
});

// -------------------------
// generate-from-csv (sticker-aware)
// - footer uses label column when --show-code is NOT set (common for human-readable)
// - if --show-code is set, footer uses label OR ulid? You can choose; here it prints the label.
// -------------------------
addStickerOptions(
    program
        .command('generate-from-csv')
        .argument('<csv_file>', 'Path to a CSV with at least a URI column')
        .option('--uri-column <name>', 'CSV column that contains the URI', 'URI')
        .option('--label-column <name>', 'CSV column for footer text (e.g. name or ulid)', 'name')
        .option('--expires-column <name>', 'CSV column for header/expiration text (optional)', 'expires')
        .option('--expires-fallback <text>', 'Fallback expiration text if expires-column is empty', null)
        .option('-o, --output <path d="">', 'Output folder', './qr_from_csv')
        .option('-f, --format <type>', 'Output format (svg|png)', 'svg')
        .option('-e, --ecl <level>', 'Error-correction Level: L, M, Q, H', 'H')
        .option('-w, --width <int>', 'Fallback QR size in px when no sticker size provided', intArg, 512)
        .option('-d, --dark <rgba>', 'Hex RGBA for dark modules', '#000000ff')
        .option('-l, --light <rgba>', 'Hex RGBA for light background', '#ffffffff')
        .option('-m, --margin <int>', 'Quiet zone margin', intArg, 0)
        .description('Generate sticker-sized QR codes from a CSV')
).action(async (csvFile, options) => {
    if (!fs.existsSync(options.output)) fs.mkdirSync(options.output, {recursive: true});
    for (const f of fs.readdirSync(options.output)) fs.unlinkSync(path.join(options.output, f));

    let rows;
    try {
        const raw = fs.readFileSync(csvFile, 'utf8');
        rows = parse(raw, {columns: true, skip_empty_lines: true, trim: true});
    } catch (e) {
        console.error(e);
        throw new Error('Could not read/parse the CSV. Make sure it has headers.');
    }

    const uris = [];

    for (const row of rows) {
        const uri = row[options.uriColumn];
        if (!uri) continue;

        const label = row[options.labelColumn] || row['ulid'] || '';
        const expiresRow = options.expiresColumn ? row[options.expiresColumn] : null;
        const expiresText = expiresRow || options.expiresFallback || options.expires || null;

        // For CSV: footer default is label; if you want it conditional, toggle show-code and set label-column accordingly.
        const footerText = options.showCode ? label : label;

        // Temporarily override options.expires per-row without mutating original
        const perRowOptions = {
            ...options,
            expires: expiresText,
            showCode: !!footerText
        };

        const {svg, dpi} = await renderQrToStickerOrFallback({
            data: uri,
            codeValue: footerText,
            options: perRowOptions,
            qrDark: options.dark,
            qrLight: options.light
        });

        const base =
            String(label).trim()
                ? String(label).replace(/[^\w.-]+/g, '_').slice(0, 64)
                : crypto.createHash('sha1').update(uri).digest('hex').slice(0, 12);

        const outFile = path.join(options.output, `${base}.${options.format}`);
        await writeOut({svg, outPath: outFile, format: options.format, dpi});

        uris.push(uri);
    }

    fs.writeFileSync(path.join(options.output, 'uris.json'), JSON.stringify(uris, null, 2), 'utf8');
});

// ===============================
// generate-framed-from-csv (UPDATED: expiration above slot + optional logo in QR)
// ===============================
program
    .command('generate-framed-from-csv')
    .argument('<csv_file>', 'CSV with at least a URI column')
    .option('--uri-column <name>', 'CSV column for QR data', 'URI')
    .option('--label-column <name>', 'CSV column for caption (e.g., name or ulid)', 'name')
    .option('--expires-column <name>', 'CSV column used for expiration text (optional)', 'expires')
    .option('--expires <text>', 'Fallback expiration text for all rows (if expires-column empty)', null)
    .option('--logo <path>', 'Path to a center image/logo (png/jpg/svg) to place in the QR', null)
    .option('--logo-scale <float>', 'Logo size relative to QR width (e.g. 0.22 = 22%)', parseFloat, 0.22)
    .option('--frame <path>', 'Path to the frame SVG', './QuestQR.svg')
    .option('--page <size>', 'Portrait page: 4x6 | 5x7', '4x6')
    .option('--dpi <int>', 'Output DPI for printing', intArg, 300)
    .option('--top-margin-in <in>', 'Top margin (inches) between page top and frame', parseFloat, 0.25)
    .option('--side-margin-in <in>', 'Side margins (inches)', parseFloat, 0.25)
    .option('--label-font-size-pt <pt>', 'Label font size (points)', parseFloat, 7.0)
    .option('--label-pad-pt <pt>', 'Gap between frame and label (points)', parseFloat, 6.0)
    .option('--expires-font-size-pt <pt>', 'Expiration font size (points)', parseFloat, 7.0)
    .option('--expires-gap-pt <pt>', 'Gap between expiration text and QR slot (points)', parseFloat, 6.0)
    .option('--crop', 'Draw crop/index marks at page corners', true)
    .option('-o, --output <path>', 'Output folder', './qr_print_cards')
    .option('-f, --format <type>', 'svg | png', 'svg')
    .description('Place QR inside a frame, add expiration above the QR (optional), add a tiny label under the frame, and export print-ready with crop marks.')
    .action(async (csvFile, options) => {
        // --- read CSV ---
        let rows;
        try {
            const raw = fs.readFileSync(csvFile, 'utf8');
            rows = parse(raw, {
                columns: true,
                skip_empty_lines: true,
                trim: true
            });
        } catch (e) {
            console.error(e);
            throw new Error('Could not read/parse the CSV.');
        }

        // --- load frame ---
        let frameSvgRaw;
        try {
            frameSvgRaw = fs.readFileSync(options.frame, 'utf8');
        } catch (e) {
            console.error(e);
            throw new Error(`Could not read frame SVG at ${options.frame}`);
        }
        const {
            viewBox,
            slot,
            content: frameContentNoSlot
        } = parseFrameSVG(frameSvgRaw);

        // --- page size in inches ---
        const dpi = Number(options.dpi);
        const pageSpec = String(options.page).toLowerCase().trim();
        let pageIn = {w: 4, h: 6};
        if (pageSpec === '5x7') pageIn = {w: 5, h: 7};
        else if (pageSpec !== '4x6') throw new Error('Unsupported --page. Use 4x6 or 5x7.');

        // --- convert to px ---
        const pagePx = {
            w: inchesToPx(pageIn.w, dpi),
            h: inchesToPx(pageIn.h, dpi)
        };
        const topMarginPx = inchesToPx(parseFloat(options.topMarginIn ?? options.topMarginIn ?? 0.25), dpi);
        const sideMarginPx = inchesToPx(parseFloat(options.sideMarginIn ?? options.sideMarginIn ?? 0.25), dpi);

        // frame target width spans page width minus side margins; keep frame aspect
        const targetFrameW = pagePx.w - sideMarginPx * 2;
        const scale = targetFrameW / viewBox.vw;
        const targetFrameH = Math.round(viewBox.vh * scale);
        const frameX = sideMarginPx;
        const frameY = topMarginPx;

        // qr-slot in final coordinates (inside the same transform as the frame)
        const slotFinal = {
            x: frameX + slot.x * scale,
            y: frameY + slot.y * scale,
            w: slot.w * scale,
            h: slot.h * scale
        };
        const qrSize = Math.min(slotFinal.w, slotFinal.h);

        // label metrics (pt -> px)
        const labelFontPx = ptToPx(Number(options.labelFontSizePt), dpi);
        const labelPadPx = ptToPx(Number(options.labelPadPt), dpi);
        const labelY = frameY + targetFrameH + labelPadPx + labelFontPx; // baseline

        // expires metrics
        const expiresFontPx = ptToPx(Number(options.expiresFontSizePt), dpi);
        const expiresGapPx = ptToPx(Number(options.expiresGapPt), dpi);
        const expiresY = slotFinal.y - expiresGapPx; // baseline just above slot

        // output dir
        if (!fs.existsSync(options.output)) fs.mkdirSync(options.output, {recursive: true});
        for (const f of fs.readdirSync(options.output)) fs.unlinkSync(path.join(options.output, f));

        const logoHref = options.logo ? toDataUri(options.logo) : null;

        // iterate rows
        for (const [idx, row] of rows.entries()) {
            const uri = row[options.uriColumn];
            if (!uri) continue;

            const label = row[options.labelColumn] || row['ulid'] || '';

            const expiresText =
                (options.expiresColumn && row[options.expiresColumn]) ||
                options.expires ||
                '';

            // --- QR as SVG string ---
            let qrSvg = await qrcode.toString(uri, {
                type: 'svg',
                errorCorrectionLevel: 'H',
                width: Math.round(qrSize),
                margin: 1,
                color: {dark: '#000000ff', light: '#ffffffff'}
            });

            if (logoHref) {
                qrSvg = injectCenterImageIntoQrSvg(qrSvg, {
                    imageHref: logoHref,
                    scale: options.logoScale,
                    bg: '#ffffffff'
                });
            }

            const qrSized = normalizeQrSvg(qrSvg, Math.round(qrSize));

            // --- compose full page SVG ---
            const pageBg = `#ffffffff`;
            const frameGroup =
                `<g transform="translate(${frameX},${frameY}) scale(${scale})">
            ${frameContentNoSlot}
         </g>`;

            const qrNode =
                `<g transform="translate(${slotFinal.x},${slotFinal.y})">
            ${qrSized}
         </g>`;

            const expiresNode = expiresText ? `
  <text x="${slotFinal.x + slotFinal.w / 2}" y="${expiresY}" text-anchor="middle"
        font-family="system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
        font-size="${expiresFontPx}" fill="#000" dominant-baseline="alphabetic">
    ${escapeXml(expiresText)}
  </text>` : '';

            const crop = options.crop
                ? cropMarksSvg({
                    x: 0, y: 0, w: pagePx.w, h: pagePx.h,
                    len: Math.round(inchesToPx(0.15, dpi)),
                    stroke: '#000',
                    strokeWidth: 0.5
                })
                : '';

            const svg =
                `<svg xmlns="http://www.w3.org/2000/svg" width="${pagePx.w}" height="${pagePx.h}" viewBox="0 0 ${pagePx.w} ${pagePx.h}">
  <rect width="100%" height="100%" fill="${pageBg}" />
  ${frameGroup}
  ${expiresNode}
  ${qrNode}
  <text x="${pagePx.w / 2}" y="${labelY}" text-anchor="middle"
        font-family="system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
        font-size="${labelFontPx}" fill="#000" dominant-baseline="alphabetic">
    ${escapeXml(label)}
  </text>
  ${crop}
</svg>`;

            const safeBase =
                safeBaseName(label, `card_${String(idx + 1).padStart(3, '0')}`);

            const outPath = path.join(options.output, `${safeBase}.${String(options.format).toLowerCase()}`);
            await writeOut({svg, outPath, format: options.format, dpi});
        }
    });

program.parse();
