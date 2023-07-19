const CIP13Regex: RegExp = /^web\+cardano:\/\/([^?]+)\??(\S+)?$/i;

interface PoolList {
    [pool_id: string]: number
}

interface CIP13URI {
    type: string,
    amount?: number,
    address?: string,
    version?: number,
    faucet_url?: string | null,
    code?: string | null
    pools?: PoolList
}

export function parse(uri:string): CIP13URI | null {
    const parsed: RegExpMatchArray | null = uri.match(CIP13Regex);

    if (parsed === null) {
        return parsed;
    }

    const path = parsed[1];
    const query = parsed[2];

    const [authority, version] = path.split('/');

    let queryParams = new URLSearchParams(query);

    console.log(queryParams);

    let uri_object:CIP13URI;

    switch (authority) {
        case 'claim':
            uri_object = {
                type: 'claim',
                version: Number(version.replace('v','')),
                faucet_url: queryParams.get('faucet_url'),
                code: queryParams.get('code')
            }
            break;
        case 'stake':
            uri_object = {
                type: 'stake'
            }

            queryParams.forEach((value,key) => {
                if (uri_object.pools === undefined) {
                    uri_object.pools = {};
                }
                console.log(`Key: ${key}: ${value}`, value);
                if (uri_object.pools[key] !== undefined) {
                    // Same pool declared more than once! Invalid URI!
                    return null;
                }
                uri_object.pools[key] = Number(value);
            });
            break;
        default:
            uri_object = {
                type: 'payment',
                address: authority
            }
            if (queryParams.has('amount')) {
                uri_object.amount = Number(queryParams.get('amount'));
            }
            break;
    }

    console.log(uri_object);
    return uri_object;


}