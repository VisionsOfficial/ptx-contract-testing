import supertest from 'supertest';
import { expect } from 'chai';
import app from 'server';
import { IContractDB } from 'interfaces/contract.interface';
import { ContractMember } from 'interfaces/schemas.interface';
import contractService from 'services/contract.service';
import Contract from 'models/contract.model';
import { config } from 'config/config';

const SERVER_PORT = 9999;
const API_ROUTE_BASE = '/contracts/';
const _logObject = (data: any) => {
  console.log(`\x1b[90m${JSON.stringify(data, null, 2)}\x1b[37m`);
};
// Test suite for the route to get all contracts with filters
describe('Routes for Contract API', () => {
  let server: any;
  let authToken: string;
  let signedContractId: string;
  let unsignedContractId: string;
  const didPartyA: string = 'DID:partyAFakeTokenForGetAllRoute';
  let authTokenCookie: any;

  before(async () => {
    server = await app.startServer(config.mongo.testUrl);
    await new Promise((resolve) => {
      server.listen(SERVER_PORT, () => {
        console.log(`Test server is running on port ${SERVER_PORT}`);
        resolve(true);
      });
    });

    await Contract.deleteMany({});
    // Get authentication token
    const authResponse = await supertest(app.router).get('/user/login');
    authTokenCookie = authResponse.headers['set-cookie'];
    authToken = authResponse.body.token;

    // Create a signed contract
    const signedContractData = {};
    const responseSigned = await supertest(app.router)
      .post(`${API_ROUTE_BASE}`)
      .set('Cookie', authTokenCookie)
      .set('Authorization', `Bearer ${authToken}`)
      .send(signedContractData);
    signedContractId = responseSigned.body._id;
    // Define the signature data for party A
    const signatureDataPartyA1: ContractMember = {
      participant: didPartyA,
      role: 'partyA',
      signature: 'partyASignature1',
    };
    // Send a PUT request to sign the contract for party A
    await supertest(app.router)
      .put(`${API_ROUTE_BASE}sign/${signedContractId}`)
      .set('Cookie', authTokenCookie)
      .set('Authorization', `Bearer ${authToken}`)
      .send(signatureDataPartyA1);

    // Create an unsigned contract
    const unsignedContractData = {};
    const responseUnsigned = await supertest(app.router)
      .post(`${API_ROUTE_BASE}`)
      .set('Cookie', authTokenCookie)
      .set('Authorization', `Bearer ${authToken}`)
      .send(unsignedContractData);
    unsignedContractId = responseUnsigned.body._id;
  });

  after(async () => {
    try {
      await contractService.deleteContract(signedContractId);
      await contractService.deleteContract(unsignedContractId);
    } catch (error: any) {
      console.log(error);
    }
    // Stop the test server
    server.close();
    console.log('Test server stopped.');
  });

  // Test case for getting all contracts
  describe(`GET ${API_ROUTE_BASE}all/`, () => {
    it('should return all contracts', async () => {
      const response = await supertest(app.router)
        .get(`${API_ROUTE_BASE}all/`)
        .set('Cookie', authTokenCookie)
        .set('Authorization', `Bearer ${authToken}`);
      //
      _logObject(response.body);
      //
      expect(response.status).to.equal(200);
      const contracts: IContractDB[] = response.body.contracts;
      // Compare with the IDs created at the beginning
      const contractIds = contracts.map((contract) => contract._id);
      expect(contractIds).to.include.members([
        signedContractId,
        unsignedContractId,
      ]);
    });

    // Test case for getting contracts with a specific DID in signatures
    it('should return contracts for a specific DID in signatures', async () => {
      const did = didPartyA;
      const response = await supertest(app.router)
        .get(`${API_ROUTE_BASE}for/${did}`)
        .set('Cookie', authTokenCookie)
        .set('Authorization', `Bearer ${authToken}`);
      //
      _logObject(response.body);
      //
      expect(response.status).to.equal(200);
      const contracts: IContractDB[] = response.body.contracts;
      // Only the signed contract should be returned
      expect(contracts.length).to.equal(1);
      expect(contracts[0]._id).to.equal(signedContractId);
    });

    // Test case for getting contracts where DID is not in signatures when hasSigned is false
    it('should return contracts where DID is not in signatures when hasSigned is false', async () => {
      const did = didPartyA;
      const hasSigned = false;
      const response = await supertest(app.router)
        .get(`${API_ROUTE_BASE}for/${did}?hasSigned=${hasSigned}`)
        .set('Cookie', authTokenCookie)
        .set('Authorization', `Bearer ${authToken}`);
      //
      _logObject(response.body);
      //
      expect(response.status).to.equal(200);
      const contracts: IContractDB[] = response.body.contracts;
      // Only the unsigned contract should be returned
      expect(contracts.length).to.equal(1);
      expect(contracts[0]._id).to.equal(unsignedContractId);
    });

    // Test case to retrieve the list of contracts with status 'pending'
    it('should return contracts with status "pending"', async () => {
      // Define the status to filter by
      const status = 'pending';
      const response = await supertest(app.router)
        .get(`${API_ROUTE_BASE}all?status=${status}`)
        .set('Cookie', authTokenCookie)
        .set('Authorization', `Bearer ${authToken}`);
      _logObject(response.body);
      expect(response.status).to.equal(200);
      const contracts: Array<any> = response.body.contracts;
      expect(contracts.length).to.equal(2);
      // Ensure that the pending contracts are present in the list
      const contractIds = contracts.map((contract) => contract._id);
      expect(contractIds).to.include.members([
        signedContractId,
        unsignedContractId,
      ]);
    });
  });
});