import { TemplatedSelect } from "../../queries/templated-query.js";
import { CountResolutionsQueryInput, CountResolutionsQueryOutput, CountSessionsQueryInput, CountSessionsQueryOutput } from "./queries.js";
import { CountAgendaItemsQueryInput, CountAgendaItemsQueryOutput } from "./queries/countAgendaItemsQueryTemplate.js";
import {
    CountVoteQueryInput,
    CountVoteQueryOutput,
} from "./queries.js";

export type CountResult = {
    count: number;
    isGehoudenDoor?: string;
    results?: { count: number; isGehoudenDoor: string }[];
};
export type CountQueries = {
    countSessionsQuery: TemplatedSelect<
        CountSessionsQueryInput,
        CountSessionsQueryOutput
    >;
    countAgendaItemsQuery: TemplatedSelect<
        CountAgendaItemsQueryInput,
        CountAgendaItemsQueryOutput
    >;
    countAgendaItemsWithoutTitleQuery: TemplatedSelect<
        CountAgendaItemsQueryInput,
        CountAgendaItemsQueryOutput
    >;
    countAgendaItemsWithoutDescriptionQuery: TemplatedSelect<
        CountAgendaItemsQueryInput,
        CountAgendaItemsQueryOutput
    >;
    countResolutionsQuery: TemplatedSelect<
        CountResolutionsQueryInput,
        CountResolutionsQueryOutput
    >;
    countVoteQuery: TemplatedSelect<CountVoteQueryInput, CountVoteQueryOutput>;
};
export type Endpoint = {
    url: string;
};
