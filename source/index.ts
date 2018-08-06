// NOTE -- 	
//  Commented out to avoid cross origin error produced when running again webpack
//  More research is necessary to resolve, as it may simply be a configuration issue.
//  Repro Steps: Checkout augur `new-contracts` branch + run `yarn dev` to start the dev server.  
//  When accessing within a browser, attempts to get files via XHR produces cross origin errors due the proto being `webpack-internal`
// import * as sourceMapSupport from "source-map-support";
// sourceMapSupport.install();

import { BlockAndLogStreamer, Configuration } from "./block-and-log-streamer";
import { Block } from "./models/block";
import { Log } from "./models/log";
import { Transaction } from "./models/transaction";
import { FilterOptions } from "./models/filters";


// -> experiment
import 'isomorphic-fetch'

const doFetch = async (method: string, params: any[]) => {
  const res = await fetch("https://mainnet.infura.io", {
    method: 'POST',
    headers: new Headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    }),
  })
  const data = await res.json()

  return data.result;
}

async function getBlockByHash(hash: string): Promise<Block|null> {
  return doFetch("eth_getBlockByHash", [hash, false]);
}

async function getLogs(filterOptions: FilterOptions): Promise<Log[]> {
  return doFetch("eth_getLogs", [filterOptions]);
}

async function getLatestBlock(): Promise<Block> {
  return doFetch("eth_getBlockByNumber", ["latest", false]);
}

const configuration: Configuration = { blockRetention: 100 }

let blockHistoryDb: Block[] = []

const createBlockStreamer = (name: string, configuration: Configuration, blockHistory: Block[]) => { 
  if (blockHistory.length) console.log("inserting block history");

  const blockAndLogStreamer = new BlockAndLogStreamer(getBlockByHash, getLogs, console.error, configuration, blockHistoryDb);
  const tokenOnBlockAdded = blockAndLogStreamer.subscribeToOnBlockAdded(block => console.log("added", block.hash));
  const tokenOnBlockRemoved = blockAndLogStreamer.subscribeToOnBlockRemoved(block => console.log("removed", block.hash));
  let interval: any = null;
  
  const start = async () => {
    console.log("starting %s", name);

    interval = setInterval(async () => {
      blockAndLogStreamer.reconcileNewBlock(await getLatestBlock());
    }, 5e3);
  }

  const stop = async () => {
    console.log("stopping %s", name);

    blockHistoryDb = await blockAndLogStreamer.getBlockHistory();
    console.log("saved %d blocks", blockHistoryDb.length)

    blockAndLogStreamer.unsubscribeFromOnBlockAdded(tokenOnBlockAdded);
    blockAndLogStreamer.unsubscribeFromOnBlockRemoved(tokenOnBlockRemoved);

    clearInterval(interval);
  }

  return {
    start,
    stop
  }
}

const blockStreamer1 = createBlockStreamer("blockStreamer1", configuration, blockHistoryDb);
let blockStreamer2 = null;

blockStreamer1.start();

setTimeout(() => {
  blockStreamer1.stop();

  setTimeout(() => {
    blockStreamer2 = createBlockStreamer("blockStreamer2", configuration, blockHistoryDb);
    blockStreamer2.start();
  }, 60e3);
}, 60e3);