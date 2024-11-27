import { Context } from "koishi";

const dataHostUrl: string = "https://data.itzdrli.cc";
const website: string = "a7f48881-235d-4ddd-821a-029993ef32e9";

const Umami = {
  async send({
    ctx,
    url = "/",
    urlSearchParams,
    title,
    eventName,
    data,
  }: {
    ctx: Context;
    url?: string;
    urlSearchParams?: Record<string, any>;
    title?: string;
    eventName?: string;
    data?: Record<string, any>;
  }) {
    return ctx.umamiStatisticsService.send({
      dataHostUrl,
      website,
      url,
      urlSearchParams,
      title,
      eventName,
      data,
    });
  },
};

export default Umami;
