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

    // Check for the validity of the address
    if (address.length === 0) {
        res.send(PooResponses.INVALIDADDRESS);
        return;
    }

    const network = checkAddress(address);

    // If network === -1 this isn't a valid address
    if (network === -1) {
        res.send(PooResponses.INVALIDADDRESS);
        return;
    }

    // Code is required in v1
    if (code.length === 0) {
        res.send(PooResponses.MISSINGCODE);
        return;
    }

    switch (code.toLowerCase()) {
        case 'test200':
            res.send(PooResponses[200]);
            break;
        case 'test201':
            res.send(PooResponses[201]);
            break;
        case 'test202':
            res.send(PooResponses[202]);
            break;
        case 'test404':
            res.send(PooResponses[404]);
            break;
        case 'test409':
            res.send(PooResponses[409]);
            break;
        case 'test410':
            res.send(PooResponses[410]);
            break;
        case 'test425':
            res.send(PooResponses[425]);
            break;
        case 'test429':
            res.send(PooResponses[429]);
            break;
        case 'testnetwork':
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

app.listen(port, () => {
    console.log(`POO Test Server running at http://localhost:${port}`);
});