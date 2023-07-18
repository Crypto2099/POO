# POO Mock Response Server

This package will run a very basic and simple Express server on your local machine in order to test wallet implementation
of the various responses that may be returned by a project's POO API server. Useful for testing and troubleshooting 
dialogs, confirmations, errors, and responses.

A PostMan Collection file is included in this repository to test locally.

The server will run at http://localhost:3411

The server supports POO v1 and v2 with dedicated endpoints for each.

## Instructions

Navigate to the `packages/test-server` directory after cloning this repository to your local machine.

Once there run the following commands:

```shell
yarn install

yarn start
```

Assuming everything is operational, you should see output similar to the following:
```
$> yarn install
yarn install v1.22.17
[1/4] Resolving packages...
[2/4] Fetching packages...
[3/4] Linking dependencies...
[4/4] Building fresh packages...
success Saved lockfile.
Done in 0.31s.


$> yarn start
yarn run v1.22.17
$ tsc && node dist/server.js
POO Test Server running at http://localhost:3411
```