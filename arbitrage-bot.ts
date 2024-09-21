import * as web3 from '@solana/web3.js';
import * as anchor from '@project-serum/anchor';
import Decimal from "decimal.js";
import { get_quote_with_slippage } from './utils'; // Funzione che calcola le quote con slippage

// Lista dei pool da analizzare
const pools = [
  '/path/to/params_AB.json',
  '/path/to/params_BC.json',
  '/path/to/params_CA.json',
];

// Connessione a Solana
const connection = new web3.Connection(web3.clusterApiUrl('mainnet-beta'));

// Funzione principale per calcolare le opportunità di arbitraggio al netto di tutti i costi
async function calculateArbitrage() {
  let tokenPaths = [];
  let graph = [];

  // 1. Inizializza il grafo dei tassi di cambio tra i token con i pool specificati
  for (let pool of pools) {
    const poolParams = await loadPoolParams(pool); // Funzione per caricare i parametri del pool
    const tokenA = poolParams.tokens[poolParams.tokenIds[0]];
    const tokenB = poolParams.tokens[poolParams.tokenIds[1]];

    // Aggiungi gli scambi tra i token al grafo, considerando lo slippage
    const rateAB = await getExchangeRateWithSlippage(tokenA, tokenB, poolParams);
    const rateBA = await getExchangeRateWithSlippage(tokenB, tokenA, poolParams);
    graph.push([rateAB, rateBA]);
    tokenPaths.push([tokenA, tokenB]);
  }

  // 2. Calcola i cicli di arbitraggio utilizzando Bellman-Ford
  const arbitrageCycles = bellmanFord(graph);

  // 3. Calcola il profitto netto per ogni ciclo, includendo tutte le fee, costi e slippage
  for (let cycle of arbitrageCycles) {
    let initialAmount = 1; // Inizia con 1 unità del primo token
    let finalAmount = initialAmount;
    
    // Calcola il profitto attraverso il ciclo, tenendo conto dei costi
    for (let i = 0; i < cycle.length - 1; i++) {
      const tokenA = tokenPaths[cycle[i]][0];
      const tokenB = tokenPaths[cycle[i]][1];
      const rate = await getExchangeRateWithSlippage(tokenA, tokenB, pools[i]);

      // Considera i costi dello swap, le fee e lo slippage
      const swapCost = await calculateTotalCost(tokenA, tokenB, pools[i]);
      finalAmount = finalAmount * rate - swapCost;
    }

    // Calcola il profitto netto
    const profit = finalAmount - initialAmount;

    // Stampa il ciclo se è profittevole al netto di tutti i costi
    if (profit > 0) {
      console.log(`Trovato arbitraggio profittevole: ${profit}`);
      console.log(`Ciclo: ${cycle}`);
    } else {
      console.log("Nessun arbitraggio profittevole trovato per questo ciclo.");
    }
  }
}

// Funzione per ottenere il tasso di cambio con slippage
async function getExchangeRateWithSlippage(tokenA, tokenB, poolParams) {
  const quote = await get_quote_with_slippage(tokenA, tokenB, poolParams, 0.5); // 0.5% slippage
  const exchangeRate = quote.expectedOutputAmount / quote.inputAmount;
  return exchangeRate;
}

// Funzione per calcolare i costi totali (fee, costi blockchain, slippage)
async function calculateTotalCost(tokenA, tokenB, poolParams) {
  // Ottieni i dettagli delle fee dalla rete o dal pool
  const swapFee = poolParams.feeBps / 10000; // Fee del pool come percentuale
  const blockchainFee = 0.000005; // Fee approssimativa per la rete Solana
  const slippageCost = poolParams.slippageBps / 10000; // Slippage stimato
  
  // Il costo totale dello swap è la somma delle fee, costi di rete e slippage
  return swapFee + blockchainFee + slippageCost;
}

// Algoritmo Bellman-Ford per trovare i cicli di arbitraggio
function bellmanFord(graph) {
  const n = graph.length;
  const dist = Array(n).fill(Infinity);
  const prev = Array(n).fill(-1);
  dist[0] = 0;

  for (let count = 0; count < n - 1; count++) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const cost = graph[i][j];
        if (dist[i] + cost < dist[j]) {
          dist[j] = dist[i] + cost;
          prev[j] = i;
        }
      }
    }
  }

  const cycles = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (dist[i] + graph[i][j] < dist[j]) {
        const cycle = [j, i];
        let k = i;
        while (!cycle.includes(prev[k])) {
          cycle.push(prev[k]);
          k = prev[k];
        }
        cycle.push(prev[k]);
        cycles.push(cycle.reverse());
      }
    }
  }

  return cycles;
}

// Funzione per caricare i parametri del pool da un file JSON
async function loadPoolParams(path) {
  const poolParams = await import(path);
  return poolParams;
}

// Avvia la ricerca di arbitraggio con calcolo dei costi e slippage
calculateArbitrage().then(() => {
  console.log("Ricerca di arbitraggio completata.");
});
