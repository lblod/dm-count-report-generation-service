import { config } from 'configuration';
import cors, { CorsOptions } from 'cors';
import express, { Express, } from "express";
import { generateReports } from 'report-generation';
import { ZodObject, z } from 'zod';
import { DateOnly, VALID_ISO_DATE_REGEX } from 'date';
import { fromZodError } from 'zod-validation-error';
import { schedule } from 'node-cron'
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import { durationWrapper } from 'cron';
import logger from 'logger';

dayjs.extend(duration)

// Init express server

const corsOptions: CorsOptions   = {
  origin: ['http://localhost:4200','http://localhost:9300'],
  methods: ['GET'],
  optionsSuccessStatus: 200,
}

const app: Express = express();
app.use(cors(corsOptions));

// Some useful health endpoints indicating that the process is running

app.get('/ping', async ( _, res ) => {
  res.send({pong: 'true'});
});
app.get('/status', async ( _, res ) => {
  res.send({running: 'true'});
});

// Debug endpoint for development

if (!config.env.DISABLE_DEBUG_ENDPOINT) {
  const getZodQueryValidationMiddleware = function(querySchema:ZodObject<any, any>):(req: express.Request, res: express.Response, next: express.NextFunction)=>void {
    return function zodQueryValidationMiddleware(
      req: express.Request<any,any,any,z.infer<typeof querySchema>>,
      res: express.Response,
      next: express.NextFunction,
    ) {
      const parse = querySchema.safeParse(req.query);
      if (!parse.success) {
        res.status(400).send(`\
  Query string not valid:
  - - - - -
  ${fromZodError(parse.error)}
  `);
        return;
      }
      next();
    }
  }
  const generateReportQuerySchema = z.object({
    day:z.string().regex(VALID_ISO_DATE_REGEX,'Day parameter needs to be ISO formatted YYYY-MM-DD.').optional(),
  }).strict();

  app.get(
    '/generate-report-now',
    getZodQueryValidationMiddleware(generateReportQuerySchema),
    async(req,res)=>{
    const query = req.query as z.infer<typeof generateReportQuerySchema>;
    const defaultedDay = query.day ?
      new DateOnly(query.day) :
      DateOnly.yesterday();
    // Do the work
    const {durationSeconds} = await durationWrapper(
      dayjs(), // Now. Used for duration calc
      generateReports, // Generate reports function
      [DateOnly.yesterday()] // Arguments for generate reports function
    );
    // Send result
    res.send({
      success: true,
      message: 'Reports generated',
      day: defaultedDay.toString(),
      durationSeconds,
    }); // Todo add diagnostic information
  })
}

// Start cron

schedule(config.env.REPORT_CRON_EXPRESSION,(now)=>{
  durationWrapper(now,generateReports,[DateOnly.yesterday()]);
})


// Start server
app.listen(config.env.SERVER_PORT,()=>{
  logger.info(`Report generation microservice started and listening on ${config.env.SERVER_PORT}.`)
});



