# Cardano P.O.O. (Proof of Onboarding) Utilities

Various helpers and utilities to assist in implementing the Proof of Onboarding (POO) Protocol on the Cardano blockchain
network.

The repository is designed as a monorepo to contain the various tools in one place.

These tools are licensed under [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/legalcode) and authored by
[Adam Dean](@crypto2099) <adam@crypto2099.io>.

## Packages

### [POO Test Server](packages/test-server)

This is a dummy server that will run locally and provide all possible responses from an expected POO Protocol API server,
the intent of this tool is to allow wallet implementors to easily test their various modals and feedback windows for 
proper behavior.

A Postman Collection file is included to see example requests and responses.
