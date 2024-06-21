export function parseObjectToArr(data: any): any[] {
    const elements: any[] = []
    if (Array.isArray(data)) {
        for (const item of data) {
            elements.push(...parseObjectToArr(item))
        }
    } else if (data instanceof Object) {
        for (const key in data) {
            elements.push(...parseObjectToArr(data[key]))
        }
    } else {
        elements.push(data)
    }
    return elements
}

export function parseJson(data: any, key: string): any[] {
    let target = data;
    const [prefix, ...suffix] = key.split('[]')
    target = !!prefix ? prefix.startsWith('[')
        ? eval(`data${prefix}`)
        : eval(`data.${prefix}`) : data
    return loopIter(target, suffix)
}

function loopIter(target: any[], suffix: string[]): any[] {
    if (!suffix || suffix.length === 0) return target
    const [s, ...nextSuffix] = suffix
    for (let i = 0; i < target.length; i++) {
        let t = target[i]
        t = eval(`t${s}`)
        target[i] = loopIter(t, nextSuffix)
    }
    return target
}
