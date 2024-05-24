import { AxiosResponse } from "axios"
import { SplitType } from "./config"


const convertMap: { [key in SplitType | string]: (res: AxiosResponse) => any } = {
    'resource': (res: AxiosResponse) => res.request.res.responseUrl,
}

export function parseData<A, B>(res: AxiosResponse<A, B>, type: SplitType): any {
    const parser = convertMap[type]
    if (!parser) {
        return res.data
    }
    return parser(res)
}
