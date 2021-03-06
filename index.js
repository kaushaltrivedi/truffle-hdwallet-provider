const ECIES = require("bitcore-ecies");
delete global._bitcore;
const bitcore = require("bitcore-lib");
var bip39 = require("bip39");
var hdkey = require("ethereumjs-wallet/hdkey");
var ProviderEngine = require("web3-provider-engine");
var FiltersSubprovider = require("web3-provider-engine/subproviders/filters.js");
var HookedSubprovider = require("web3-provider-engine/subproviders/hooked-wallet.js");
var Web3Subprovider = require("web3-provider-engine/subproviders/web3.js");
var Web3 = require("web3");
var Transaction = require("ethereumjs-tx");

let PrivateKey = bitcore.PrivateKey;
let PublicKey = bitcore.PublicKey;

function HDWalletProvider(
  mnemonic,
  provider_url,
  address_index = 0,
  num_addresses = 1
) {
  this.mnemonic = mnemonic;
  this.hdwallet = hdkey.fromMasterSeed(bip39.mnemonicToSeed(mnemonic));
  this.wallet_hdpath = "m/44'/60'/0'/0/";
  this.wallets = {};
  this.addresses = [];

  for (let i = address_index; i < address_index + num_addresses; i++) {
    var wallet = this.hdwallet.derivePath(this.wallet_hdpath + i).getWallet();
    var addr = "0x" + wallet.getAddress().toString("hex");
    this.addresses.push(addr);
    this.wallets[addr] = wallet;
  }

  const tmp_accounts = this.addresses;
  const tmp_wallets = this.wallets;

  this.engine = new ProviderEngine();
  this.engine.addProvider(
    new HookedSubprovider({
      getAccounts: function(cb) {
        cb(null, tmp_accounts);
      },
      getPrivateKey: function(address, cb) {
        if (!tmp_wallets[address]) {
          return cb("Account not found");
        } else {
          cb(null, tmp_wallets[address].getPrivateKey().toString("hex"));
        }
      },
      signTransaction: function(txParams, cb) {
        let pkey;
        if (tmp_wallets[txParams.from]) {
          pkey = tmp_wallets[txParams.from].getPrivateKey();
        } else {
          cb("Account not found");
        }
        var tx = new Transaction(txParams);
        tx.sign(pkey);
        var rawTx = "0x" + tx.serialize().toString("hex");
        cb(null, rawTx);
      }
    })
  );
  this.engine.addProvider(new FiltersSubprovider());
  this.engine.addProvider(
    new Web3Subprovider(new Web3.providers.HttpProvider(provider_url))
  );
  this.engine.start(); // Required by the provider engine.
}

HDWalletProvider.prototype.sendAsync = function() {
  this.engine.sendAsync.apply(this.engine, arguments);
};

HDWalletProvider.prototype.send = function() {
  return this.engine.send.apply(this.engine, arguments);
};

// returns the address of the given address_index, first checking the cache
HDWalletProvider.prototype.getAddress = function(idx) {
  console.log("getting addresses", this.addresses[0], idx);
  if (!idx) {
    return this.addresses[0];
  } else {
    return this.addresses[idx];
  }
};

// returns the addresses cache
HDWalletProvider.prototype.getAddresses = function() {
  return this.addresses;
};

HDWalletProvider.prototype.getWallet = function() {
  return {
    privateKey: this.wallets[this.addresses[0]].getPrivateKey().toString("hex"),
    publicKey: this.wallets[this.addresses[0]].getPublicKey().toString("hex")
  };
};

HDWalletProvider.prototype.getPublicKey = function() {
  return this.wallets[this.addresses[0]].getPublicKey().toString("hex");
};

HDWalletProvider.prototype.encrypt = function(data, publicKey) {
  const privateKey = new PrivateKey(this.getWallet().privateKey);
  let _publicKey;
  if (publicKey) {
    _publicKey = new PublicKey(publicKey);
  } else {
    _publicKey = new PublicKey(privateKey);
  }

  let ecies = ECIES()
    .publicKey(_publicKey)
    .privateKey(privateKey);

  return ecies.encrypt(data).toString("hex");
};

HDWalletProvider.prototype.decrypt = function(encryptedData) {
  const privateKey = new PrivateKey(this.getWallet().privateKey);

  let ecies = ECIES().privateKey(privateKey);

  var decryptMe = new Buffer(encryptedData, "hex");

  return ecies.decrypt(decryptMe).toString("utf8");
};

module.exports = HDWalletProvider;
