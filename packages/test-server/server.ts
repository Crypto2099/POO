import express from 'express';
import {PooResponses, checkAddress} from "./responses";
const app = express();
const port:number = 3411;


app.use(express.json());

/**
 * For testing purposes we define several codes that will return anticipated responses.
 */
app.post("/v1", (req, res) => {
    const address:string = req.body.address;
    const code:string = req.body.code;

    if (address.length === 0) {
        res.send(PooResponses.INVALIDADDRESS);
        return;
    }

    if (code.length === 0) {
        res.send(PooResponses.MISSINGCODE);
        return;
    }

    const network = checkAddress(address);

    if (network === -1) {
        res.send(PooResponses.INVALIDADDRESS);
        return;
    }

    switch (code) {
        case 'TEST200':
            res.send(PooResponses[200]);
            break;
        case 'TEST201':
            res.send(PooResponses[201]);
            break;
        case 'TEST202':
            res.send(PooResponses[202]);
            break;
        case 'TEST404':
            res.send(PooResponses[404]);
            break;
        case 'TEST409':
            res.send(PooResponses[409]);
            break;
        case 'TEST410':
            res.send(PooResponses[410]);
            break;
        case 'TEST425':
            res.send(PooResponses[425]);
            break;
        case 'TEST429':
            res.send(PooResponses[429]);
            break;
        case 'TESTNETWORK':
            if (network !== 1) {
                res.send(PooResponses.INVALIDNETWORK);
                break;
            } else {
                res.send(PooResponses[200]);
                break;
            }
        default:
            res.status(500).send('REKT');
    }
});

app.post("/v2", (req, res) => {

});

app.listen(port, () => {
    console.log(`POO Test Server running at http://localhost:${port}`);
});