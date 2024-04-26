import { config } from 'configuration';
import cors, { CorsOptions } from 'cors';
import express, { Express, } from "express";
import { generateReports } from './report-generation';

const corsOptions: CorsOptions   = {
  origin: ['http://localhost:4200','http://localhost:9300'],
  methods: ['GET'],
  optionsSuccessStatus: 200,
}

const app: Express = express();

app.use(cors(corsOptions));
app.get('/ping', async ( _, res ) => {
  res.send({pong: 'true'});
});

if (!config.env.DISABLE_DEBUG_ENDPOINT) {
  // no operatio
}

console.log(`Service started.`)

async function test() {
  await generateReports();
}

test().then((res)=> {
  console.log("Test finished",res);
  app.listen()
}).catch((reason)=>{
  console.error(reason);
})


