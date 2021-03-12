const notAlphanumericChar = /[^0-9A-Za-z]/g

export class Dimension {
    constructor(public dimension: string, public valueGraphUris: string[]) {}

    public getValueVariableAlias = () => this.dimension.replaceAll(notAlphanumericChar, '')
    public getValueLabelVariableAlias = () => `${this.getValueVariableAlias()}Label`
}

export class Attribute {
    constructor(public attribute: string, public valueGraphUris: string[]) {}
    public getValueVariableAlias = (measure: Measure) => measure.variableAliasBase + this.attribute.replaceAll(notAlphanumericChar, "")
    public getLabelValueVariableAlias = (measure: Measure) => this.getValueVariableAlias(measure) + "Label"
}

export class Measure {
    public variableAliasBase: string
    constructor(public measure: string) {
        this.variableAliasBase = this.measure.replaceAll(notAlphanumericChar, '')
    }
    public getObsVariableAlias = () => `${this.variableAliasBase}Obs`
    public getValueVariableAlias = () => `${this.getObsVariableAlias()}Value`
}

export type Component = Dimension | Attribute | Measure

export class DataSet {
    constructor(public keys: string[], public measureAttributeKeys: string[], public data: {[key: string]: ComponentValue | any}[]) {}
}

export abstract class ComponentValue<T= any> {
    constructor(public uri: string, public value: T) {}
}

export class DimensionValue<T= any> extends ComponentValue<T> {
    constructor(uri: string, value: T) {
        super(uri, value)
    }
}

export class AttributeValue<T= any> extends ComponentValue<T> {
    constructor(public attributeUri: string, valueUri: string, value: T) {
        super(valueUri, value)
    }
}

export class ObservedValue<T = any> extends ComponentValue<T> {
    constructor(uri: string, value: T, public attributes: AttributeValue[]) {
        super(uri, value)
    }

    public getUnitAttributeValue = (): AttributeValue => this.attributes.find(a => a.attributeUri === "http://purl.org/linked-data/sdmx/2009/attribute#unitMeasure")
}

export const getDataStructureDefinition = async (dataSetUri: string, endPointUri: string): Promise<Component[]> => {
    // Need to get the dimensions, attributes and measures used in this dataset.
    // Is also helpful to find out which graphs the labels for these items live.
    const dimensionsQuery = `
        PREFIX qb: <http://purl.org/linked-data/cube#>
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

        # Get info on all of the dimensions in this dataset and find out which graphs the URIs are located in (to optimise later queries).
        SELECT DISTINCT ?dimension ?labelGraphUri
        WHERE {
            {
                SELECT DISTINCT ?dimension ?dimensionValue
                WHERE {
                    BIND(<${dataSetUri}> as ?dataSet)
                    GRAPH ?dataSetGraph {

                        ?dataSet 
                            a qb:DataSet;
                            qb:structure/qb:component/qb:dimension ?dimension.
                    }
                    GRAPH ?dataSetGraph {
                        ?obs
                            a qb:Observation; 
                            qb:dataSet ?dataSet;
                            ?dimension ?dimensionValue.
                    }
                }
            }

            OPTIONAL {
                GRAPH ?labelGraphUri {
                    ?dimensionValue rdfs:label ?label.
                }
            }
        }
    `

    const attributesQuery = `
        PREFIX qb: <http://purl.org/linked-data/cube#>
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

        SELECT DISTINCT ?attribute ?labelGraphUri
        WHERE {
            {
                SELECT DISTINCT ?attribute ?attributeValue
                WHERE {
                    BIND(<${dataSetUri}> as ?dataSet)
                    GRAPH ?dataSetGraph {

                        ?dataSet 
                            a qb:DataSet;
                            qb:structure/qb:component/qb:attribute ?attribute.
                    }
                    GRAPH ?dataSetGraph {
                        ?obs
                            a qb:Observation; 
                            qb:dataSet ?dataSet;
                            ?attribute ?attributeValue.
                    }
                }
            }

            GRAPH ?labelGraphUri {
                ?attributeValue rdfs:label ?label.
            }
        }
    `

    const measuresQuery = `
        PREFIX qb: <http://purl.org/linked-data/cube#>

        SELECT ?measure 
        WHERE {
            GRAPH ?dataSetGraph {
                BIND (<${dataSetUri}> as ?dataSet).
                ?dataSet a qb:DataSet.

                ?dataSet qb:structure/qb:component/qb:measure ?measure.
            }
            # Measure values are literals and should never be URIS.
        }
    `

    // Running queries in parallel is a *lot* faster than running a single query unioning these together.
    const allResults = await Promise.all(
        [dimensionsQuery, attributesQuery, measuresQuery]
            .map(sparqlQuery => query<any>(endPointUri, sparqlQuery))
    )
    const results = allResults.flatMap(r => r);

    const mapDimensionToValueGraphUris: {[dimensionUri: string]: string[]} = {}
    const mapAttributeToValueGraphUris: {[attributeUri: string]: string[]} = {}

    const uniqueComponents: Component[] = []
    for(const component of results) {
        if ("dimension" in component) {
            const dimensionUri = component["dimension"];
            const valueGraphUri = component["labelGraphUri"]
            if (!(dimensionUri in mapDimensionToValueGraphUris)){
                const valueGraphUris = []
                uniqueComponents.push(new Dimension(dimensionUri, valueGraphUris))
                mapDimensionToValueGraphUris[dimensionUri] = valueGraphUris
            }
            if (typeof valueGraphUri !== "undefined" && valueGraphUri !== null) {
                mapDimensionToValueGraphUris[dimensionUri].push(valueGraphUri)
            }
        } else if ("attribute" in component) {
            const attributeUri = component["attribute"];
            const valueGraphUri = component["labelGraphUri"]
            if (!(attributeUri in mapAttributeToValueGraphUris)){
                const valueGraphUris = []
                uniqueComponents.push(new Attribute(attributeUri, valueGraphUris))
                mapAttributeToValueGraphUris[attributeUri] = valueGraphUris
            }

            if (typeof valueGraphUri !== "undefined" && valueGraphUri !== null) {
                mapAttributeToValueGraphUris[attributeUri].push(valueGraphUri)
            }
        } else if ("measure" in component) {
            uniqueComponents.push(new Measure(component["measure"]))
        } else {
            throw new Error(`Unmatched component: ${JSON.stringify(component)}`)
        }
    }

    return uniqueComponents
}

export const getData = async (
    dataSetUri: string, 
    endPointUri: string, 
    dataSetComponents: Component[],
    page: number = 1,
    pageSize: number = 25
): Promise<DataSet> => {
    const offset = (page - 1) * pageSize

    const dimensions = <Dimension[]>dataSetComponents.filter(c => c instanceof Dimension)
    const attributes = <Attribute[]>dataSetComponents.filter(c => c instanceof Attribute)
    const measures = <Measure[]>dataSetComponents.filter(c => c instanceof Measure)

    const dimensionsNotQbMeasure = dimensions.filter(d => d.dimension !== "http://purl.org/linked-data/cube#measureType")

    const nonQbMeasureDimensionVariableAliases = dimensionsNotQbMeasure.map(d => `?${d.getValueVariableAlias()} ?${d.getValueLabelVariableAlias()}`);

    const nonQbMeasureDimensionUrisWithVariables = 
        dimensionsNotQbMeasure
            .map(d => `<${d.dimension}> ?${d.getValueVariableAlias()}`)
            .join(";\n")

    const sparqlQuery = `
    PREFIX qb: <http://purl.org/linked-data/cube#>
    PREFIX sdmx: <http://purl.org/linked-data/sdmx/2009/attribute#>
    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

    SELECT *
    WHERE {   
        GRAPH ?dataSetGraph {
            SELECT *
            WHERE {
                {
                    SELECT ${nonQbMeasureDimensionVariableAliases.join(' ')}
                    WHERE {
                        BIND(<${dataSetUri}> as ?dataSet).
                        ?dataSet a qb:DataSet.
                        
                        []
                            a qb:Observation;
                            qb:dataSet ?dataSet;
                            ${nonQbMeasureDimensionUrisWithVariables}.

                        # Find the label for each dimension value by searching the graphs we know labels are found in.
                        # todo: Might want to put the below into a SELECT LIMIT 1 sub query to deal with possible duplicate labels better.
                        ${
                            dimensionsNotQbMeasure
                                .map(d => 
                                    d.valueGraphUris
                                        .map(graphUri => `
                                        {
                                            GRAPH <${graphUri}> {
                                                ?${d.getValueVariableAlias()} rdfs:label ?${d.getValueLabelVariableAlias()}.
                                            }
                                        }
                                        `)
                                        .join(" UNION\n")    
                                )
                                .join("\n")
                        }
                    }
                    GROUP BY ${nonQbMeasureDimensionVariableAliases.join(' ')}
                    # Ordering and paging here.
                    # Order by the label, as you would expect to see on the front-end.
                    ORDER BY ${dimensionsNotQbMeasure.map(d => `ASC(?${d.getValueLabelVariableAlias()})`).join(" ")}
                    OFFSET ${offset}
                    LIMIT ${pageSize}
                }

                ${
                    measures
                        .map(m => `
                            OPTIONAL {
                                # Get observation for this measure and set of fixed dimension values.
                                ?${m.getObsVariableAlias()} 
                                    ${nonQbMeasureDimensionUrisWithVariables};
                                    qb:measureType <${m.measure}>.

                                # Get value if it exists.
                                OPTIONAL {
                                    ?${m.getObsVariableAlias()} 
                                    <${m.measure}> ?${m.getValueVariableAlias()}.
                                }
                                
                                # Fetch attributes for this measure.
                                ${
                                    attributes
                                        .map(a => `
                                            OPTIONAL {
                                                ?${m.getObsVariableAlias()} <${a.attribute}> ?${a.getValueVariableAlias(m)}.
                                                
                                                ${
                                                    a.valueGraphUris
                                                        .map(graphUri => `
                                                        {
                                                            GRAPH <${graphUri}> {
                                                                ?${a.getValueVariableAlias(m)} rdfs:label ?${a.getLabelValueVariableAlias(m)}.
                                                            }
                                                        }
                                                        `)
                                                        .join(" UNION\n")
                                                }
                                            }
                                        `)
                                        .join("\n")
                                }    
                            }

                        `)
                        .join('\n')
                }
            }
        }
    }
    `

    const results = await query(endPointUri, sparqlQuery);

    const mappedResults = results.map(r => {
        const resultOut: {[key: string]: ComponentValue | any} = {}

        dimensionsNotQbMeasure
            .forEach(d => resultOut[d.dimension] = new DimensionValue(r[d.getValueVariableAlias()], r[d.getValueLabelVariableAlias()]))

        measures.forEach(m => {
            const measureVal = r[m.getValueVariableAlias()]
            const obsUri = r[m.getObsVariableAlias()]

            const attributesForResult = attributes
                .map(a => {
                    const attrVal = r[a.getValueVariableAlias(m)]
                    const attrLabel = r[a.getLabelValueVariableAlias(m)]
                    if (attrVal || attrLabel) {
                        return new AttributeValue(a.attribute, attrVal, attrLabel)
                    }

                    return undefined
                })
                .filter(a => typeof a !== "undefined")

            if (measureVal || attributesForResult.length > 0) {
                resultOut[m.measure] = new ObservedValue(obsUri, measureVal, attributesForResult)
            } else {
                resultOut[m.measure] = undefined
            }
        })

        return resultOut
    });

    const columnsOut = 
        dimensionsNotQbMeasure
            .map(d => (d.dimension))
            .concat(measures.map(m => m.measure))

    const attributeKeys = attributes.map(a => a.attribute)

    return new DataSet(columnsOut, attributeKeys, mappedResults)
}

interface ISparqlResponse {
    head: {
        vars: string[]
    }
    results: ISparqlResponseResult
}

interface ISparqlResponseResult {
    bindings: { [varName: string]: ISparqlResponseResultBinding }[]
}

interface ISparqlResponseResultBinding<T = any> {
    type: "uri"
    value: T
}

const query = async <T>(endPointUri: string, query: string): Promise<T[]> => {
    console.log(query)
    const headers = new Headers()
    headers.append("Accept", "application/json");
    headers.append("Content-Type", "application/x-www-form-urlencoded")
    const formData = new URLSearchParams()
    formData.append("query", query);
    const response = await fetch(endPointUri, {
        headers: headers,
        method: "POST",
        body: formData,
        mode: "cors"
    })

    const responseObject = <ISparqlResponse>await response.json();

    return responseObject.results.bindings.map(result => {
        const resultOut = <any>{}
        for (const variableName in result) {
            resultOut[variableName] = <any>result[variableName].value
        }
        return <T>resultOut
    })
}