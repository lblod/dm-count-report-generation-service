import { TemplatedSelect } from '../../queries/templated-query.js';
import {
  CountResolutionsQueryInput,
  CountResolutionsQueryOutput,
  CountSessionsQueryInput,
  CountSessionsQueryOutput,
} from './queries.js';
import {
  CountAgendaItemsQueryInput,
  CountAgendaItemsQueryOutput,
} from './queries/countAgendaItemsQueryTemplate.js';
import { CountVoteQueryInput, CountVoteQueryOutput } from './queries.js';

export type CountResult = {
  count: number;
  isGehoudenDoor?: string;
  results?: { count: number; isGehoudenDoor: string }[];
};
export type CountQueries = {
  countSessionsQuery: TemplatedSelect<CountSessionsQueryInput, CountSessionsQueryOutput>;
  countAgendaItemsQuery: TemplatedSelect<CountAgendaItemsQueryInput, CountAgendaItemsQueryOutput>;
  countAgendaItemsWithoutTitleQuery: TemplatedSelect<
    CountAgendaItemsQueryInput,
    CountAgendaItemsQueryOutput
  >;
  countAgendaItemsWithoutDescriptionQuery: TemplatedSelect<
    CountAgendaItemsQueryInput,
    CountAgendaItemsQueryOutput
  >;
  countResolutionsQuery: TemplatedSelect<CountResolutionsQueryInput, CountResolutionsQueryOutput>;
  countVoteQuery: TemplatedSelect<CountVoteQueryInput, CountVoteQueryOutput>;
  countDuplicateAgendaItemsQuery: TemplatedSelect<
    CountAgendaItemsQueryInput,
    CountAgendaItemsQueryOutput
  >;
};
export type Endpoint = {
  url: string;
};

export enum AdminUnitClass {
  Municipality = 'http://data.vlaanderen.be/id/concept/BestuurseenheidClassificatieCode/5ab0e9b8a3b2ca7c5e000001',
  OCMW = 'http://data.vlaanderen.be/id/concept/BestuurseenheidClassificatieCode/5ab0e9b8a3b2ca7c5e000002',
  Province = 'http://data.vlaanderen.be/id/concept/BestuurseenheidClassificatieCode/5ab0e9b8a3b2ca7c5e000000',
}
