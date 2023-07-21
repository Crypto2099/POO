export interface pooTokens {
    [tokenid: string]: string
}

export interface pooResponse {
    code: number,
    status: string,
    lovelaces?: string,
    queue_position?: number,
    tx_hash?: string,
    tokens?: pooTokens
}

/**
 * Check whether an address is valid or not.
 *
 * Mainnet address returns 1
 * Testnet address returns 0
 * Invalid address returns -1
 *
 * @param addr
 * @return number
 */
export function checkAddress(addr: string): number {
    const addr_regex = /^addr(_test)?1(?=[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+)(?:.{53,98})$/i

    const resp = addr.match(addr_regex);

    // If the response is null, this is not a valid Cardano network address
    if (resp === null) {
        return -1;
    }

    // If the match at index 1 exists, this is a testnet address
    return (resp[1]) ? 0 : 1;
}

export const PooResponses: {[code: number|string]: pooResponse} = {
    200: {
        code: 200,
        status: 'accepted',
        lovelaces: '2000000',
        tokens: {
            "a0028f350aaabe0545fdcb56b039bfb08e4bb4d8c4d7c3c7d481c235.484f534b59": "1000000000"
        }
    },
    201: {
        code: 201,
        status: 'queued',
        lovelaces: '2000000',
        queue_position: 42,
        tokens: {
            "a0028f350aaabe0545fdcb56b039bfb08e4bb4d8c4d7c3c7d481c235.484f534b59": "1000000000"
        }
    },
    202: {
        code: 202,
        status: 'claimed',
        lovelaces: '2000000',
        tokens: {
            "a0028f350aaabe0545fdcb56b039bfb08e4bb4d8c4d7c3c7d481c235.484f534b59": "1000000000"
        },
        tx_hash: 'f67470d5e2d4aabb7019b367078333e66f89217f0cec228bc68af94f35d12ba9'
    },
    400: {
        code: 400,
        status: 'badrequest'
    },
    404: {
        code: 404,
        status: 'notfound'
    },
    409: {
        code: 409,
        status: 'alreadyclaimed'
    },
    410: {
        code: 410,
        status: 'expired'
    },
    425: {
        code: 425,
        status: 'tooearly'
    },
    429: {
        code: 429,
        status: 'ratelimited'
    },
    INVALIDADDRESS: {
        code: 400,
        status: 'invalidaddress'
    },
    MISSINGCODE: {
        code: 400,
        status: 'missingcode'
    },
    INVALIDNETWORK: {
        code: 400,
        status: 'invalidnetwork'
    }
}
