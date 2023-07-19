import * as CIP13Parser from "../src/CIP13Parser";

describe('Testing CIP13Parser', () => {
    test('A URL should equal null', () => {
        expect(CIP13Parser.parse('https://nftxlv.com')).toBeNull();
    });

    test(`A payment URI should have type 'payment'`, () => {
        const result = CIP13Parser.parse('web+cardano://addr_test1vpud7l2323adx8h5pzgxq8vhffc2stv4r8wkjwj5kmkxjjg2radec');
        if (!result) {
            throw new Error(`It didn't did it!`);
        }
        expect(result.type).toBe('payment');
    })

    test(`A payment URI with a value!`, () => {
        const result = CIP13Parser.parse('web+cardano://addr_test1vpud7l2323adx8h5pzgxq8vhffc2stv4r8wkjwj5kmkxjjg2radec?amount=123.456789')
        if (!result) {
            throw new Error(`Payment URI with a value didn't did it!`);
        }
        expect(result.type).toBe('payment');
        expect(result.address).toBe('addr_test1vpud7l2323adx8h5pzgxq8vhffc2stv4r8wkjwj5kmkxjjg2radec');
        expect(result.amount).toBe(123.456789);
    })

    test(`A v1 Claim URI should have type 'claim' and version 1`, () => {
        const result = CIP13Parser.parse('web+cardano://claim/v1?faucet_url=https://nftxlv.com&code=abc123');
        if (!result) {
            throw new Error(`Claim v1 URI is null?!`);
        }
        expect(result.type).toBe('claim');
        expect(result.version).toBe(1);
    })

    // Note only one slash between the scheme and the authority
    test('An invalid v1 URI should fail', () => {
        expect(CIP13Parser.parse('web+cardano:/claim/v1?faucet_url=https://nftxlv.com&code=abc123')).toBeNull()
    })

    test(`A Stake URI to a single pool by Hex ID`, () => {
        const result = CIP13Parser.parse('web+cardano://stake?c94e6fe1123bf111b77b57994bcd836af8ba2b3aa72cfcefbec2d3d4');
        if (!result || !result.pools) {
            throw new Error(`Stake URI with Pool Hex ID didn't did it!`);
        }
        expect(result.type).toBe('stake');
        expect(result.pools['c94e6fe1123bf111b77b57994bcd836af8ba2b3aa72cfcefbec2d3d4']).toBe(0);
    })

    test(`A Stake URI to multiple pools by ticker`, () => {
        const result = CIP13Parser.parse('web+cardano://stake?POOL1=3.14159&POOL2=2.71828');
        if (!result || !result.pools) {
            throw new Error(`Stake URI with multiple pools by ticker didn't did it!`);
        }
        expect(result.type).toBe('stake');
        expect(result.pools['POOL1']).toBe(3.14159);
        expect(result.pools['POOL2']).toBe(2.71828);
    })
});