define(["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getData = exports.getDataStructureDefinition = exports.ObservedValue = exports.AttributeValue = exports.DimensionValue = exports.ComponentValue = exports.DataSet = exports.Measure = exports.Attribute = exports.Dimension = void 0;
    const notAlphanumericChar = /[^0-9A-Za-z]/g;
    class Dimension {
        constructor(dimension, valueGraphUris) {
            this.dimension = dimension;
            this.valueGraphUris = valueGraphUris;
            this.getValueVariableAlias = () => this.dimension.replaceAll(notAlphanumericChar, '');
            this.getValueLabelVariableAlias = () => `${this.getValueVariableAlias()}Label`;
        }
    }
    exports.Dimension = Dimension;
    class Attribute {
        constructor(attribute, valueGraphUris) {
            this.attribute = attribute;
            this.valueGraphUris = valueGraphUris;
            this.getValueVariableAlias = (measure) => measure.variableAliasBase + this.attribute.replaceAll(notAlphanumericChar, "");
            this.getLabelValueVariableAlias = (measure) => this.getValueVariableAlias(measure) + "Label";
        }
    }
    exports.Attribute = Attribute;
    class Measure {
        constructor(measure) {
            this.measure = measure;
            this.getObsVariableAlias = () => `${this.variableAliasBase}Obs`;
            this.getValueVariableAlias = () => `${this.getObsVariableAlias()}Value`;
            this.variableAliasBase = this.measure.replaceAll(notAlphanumericChar, '');
        }
    }
    exports.Measure = Measure;
    class DataSet {
        constructor(keys, measureAttributeKeys, data) {
            this.keys = keys;
            this.measureAttributeKeys = measureAttributeKeys;
            this.data = data;
        }
    }
    exports.DataSet = DataSet;
    class ComponentValue {
        constructor(uri, value) {
            this.uri = uri;
            this.value = value;
        }
    }
    exports.ComponentValue = ComponentValue;
    class DimensionValue extends ComponentValue {
        constructor(uri, value) {
            super(uri, value);
        }
    }
    exports.DimensionValue = DimensionValue;
    class AttributeValue extends ComponentValue {
        constructor(attributeUri, valueUri, value) {
            super(valueUri, value);
            this.attributeUri = attributeUri;
        }
    }
    exports.AttributeValue = AttributeValue;
    class ObservedValue extends ComponentValue {
        constructor(uri, value, attributes) {
            super(uri, value);
            this.attributes = attributes;
            this.getUnitAttributeValue = () => this.attributes.find(a => a.attributeUri === "http://purl.org/linked-data/sdmx/2009/attribute#unitMeasure");
        }
    }
    exports.ObservedValue = ObservedValue;
    const getDataStructureDefinition = async (dataSetUri, endPointUri) => {
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
    `;
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
    `;
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
    `;
        // Running queries in parallel is a *lot* faster than running a single query unioning these together.
        const allResults = await Promise.all([dimensionsQuery, attributesQuery, measuresQuery]
            .map(sparqlQuery => query(endPointUri, sparqlQuery)));
        const results = allResults.flatMap(r => r);
        const mapDimensionToValueGraphUris = {};
        const mapAttributeToValueGraphUris = {};
        const uniqueComponents = [];
        for (const component of results) {
            if ("dimension" in component) {
                const dimensionUri = component["dimension"];
                const valueGraphUri = component["labelGraphUri"];
                if (!(dimensionUri in mapDimensionToValueGraphUris)) {
                    const valueGraphUris = [];
                    uniqueComponents.push(new Dimension(dimensionUri, valueGraphUris));
                    mapDimensionToValueGraphUris[dimensionUri] = valueGraphUris;
                }
                if (typeof valueGraphUri !== "undefined" && valueGraphUri !== null) {
                    mapDimensionToValueGraphUris[dimensionUri].push(valueGraphUri);
                }
            }
            else if ("attribute" in component) {
                const attributeUri = component["attribute"];
                const valueGraphUri = component["labelGraphUri"];
                if (!(attributeUri in mapAttributeToValueGraphUris)) {
                    const valueGraphUris = [];
                    uniqueComponents.push(new Attribute(attributeUri, valueGraphUris));
                    mapAttributeToValueGraphUris[attributeUri] = valueGraphUris;
                }
                if (typeof valueGraphUri !== "undefined" && valueGraphUri !== null) {
                    mapAttributeToValueGraphUris[attributeUri].push(valueGraphUri);
                }
            }
            else if ("measure" in component) {
                uniqueComponents.push(new Measure(component["measure"]));
            }
            else {
                throw new Error(`Unmatched component: ${JSON.stringify(component)}`);
            }
        }
        return uniqueComponents;
    };
    exports.getDataStructureDefinition = getDataStructureDefinition;
    const getData = async (dataSetUri, endPointUri, dataSetComponents, page = 1, pageSize = 25) => {
        const offset = (page - 1) * pageSize;
        const dimensions = dataSetComponents.filter(c => c instanceof Dimension);
        const attributes = dataSetComponents.filter(c => c instanceof Attribute);
        const measures = dataSetComponents.filter(c => c instanceof Measure);
        const dimensionsNotQbMeasure = dimensions.filter(d => d.dimension !== "http://purl.org/linked-data/cube#measureType");
        const nonQbMeasureDimensionVariableAliases = dimensionsNotQbMeasure.map(d => `?${d.getValueVariableAlias()} ?${d.getValueLabelVariableAlias()}`);
        const nonQbMeasureDimensionUrisWithVariables = dimensionsNotQbMeasure
            .map(d => `<${d.dimension}> ?${d.getValueVariableAlias()}`)
            .join(";\n");
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
                        
                        {
                            SELECT *
                            WHERE {
                                []
                                    a qb:Observation;
                                    qb:dataSet ?dataSet;
                                    ${nonQbMeasureDimensionUrisWithVariables}.
                            }
                        }

                        # Find the label for each dimension value by searching the graphs we know labels are found in.
                        ${dimensionsNotQbMeasure
            .map(d => `{ 
                                        # Account for possible duplicate lables.
                                        #SELECT ?${d.getValueVariableAlias()} (GROUP_CONCAT(?${d.getValueLabelVariableAlias()}inner; separator=",") as ?${d.getValueLabelVariableAlias()})
                                        SELECT ?${d.getValueVariableAlias()} (MIN(?${d.getValueLabelVariableAlias()}inner) as ?${d.getValueLabelVariableAlias()})
                                        #SELECT ?${d.getValueVariableAlias()} (SAMPLE(?${d.getValueLabelVariableAlias()}inner) as ?${d.getValueLabelVariableAlias()})
                                        WHERE {
                                            ${d.valueGraphUris
            .map(graphUri => `
                                                {
                                                    GRAPH <${graphUri}> {
                                                        ?${d.getValueVariableAlias()} rdfs:label ?${d.getValueLabelVariableAlias()}inner.
                                                    }
                                                }
                                                `)
            .join(" UNION\n")}
                                        }
                                        GROUP BY ?${d.getValueVariableAlias()}
                                    }`)
            .join("\n")}
                    }
                    GROUP BY ${nonQbMeasureDimensionVariableAliases.join(' ')}
                    # Ordering and paging here.
                    # Order by the label, as you would expect to see on the front-end.
                    ORDER BY ${dimensionsNotQbMeasure.map(d => `ASC(?${d.getValueLabelVariableAlias()})`).join(" ")}
                    OFFSET ${offset}
                    LIMIT ${pageSize}
                }

                ${measures
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
                                ${attributes
            .map(a => `
                                            OPTIONAL {
                                                ?${m.getObsVariableAlias()} <${a.attribute}> ?${a.getValueVariableAlias(m)}.
                                                
                                                ${a.valueGraphUris
            .map(graphUri => `
                                                        {
                                                            GRAPH <${graphUri}> {
                                                                ?${a.getValueVariableAlias(m)} rdfs:label ?${a.getLabelValueVariableAlias(m)}.
                                                            }
                                                        }
                                                        `)
            .join(" UNION\n")}
                                            }
                                        `)
            .join("\n")}    
                            }

                        `)
            .join('\n')}
            }
        }
    }
    `;
        const results = await query(endPointUri, sparqlQuery);
        const mappedResults = results.map(r => {
            const resultOut = {};
            dimensionsNotQbMeasure
                .forEach(d => resultOut[d.dimension] = new DimensionValue(r[d.getValueVariableAlias()], r[d.getValueLabelVariableAlias()]));
            measures.forEach(m => {
                const measureVal = r[m.getValueVariableAlias()];
                const obsUri = r[m.getObsVariableAlias()];
                const attributesForResult = attributes
                    .map(a => {
                    const attrVal = r[a.getValueVariableAlias(m)];
                    const attrLabel = r[a.getLabelValueVariableAlias(m)];
                    if (attrVal || attrLabel) {
                        return new AttributeValue(a.attribute, attrVal, attrLabel);
                    }
                    return undefined;
                })
                    .filter(a => typeof a !== "undefined");
                if (measureVal || attributesForResult.length > 0) {
                    resultOut[m.measure] = new ObservedValue(obsUri, measureVal, attributesForResult);
                }
                else {
                    resultOut[m.measure] = undefined;
                }
            });
            return resultOut;
        });
        const columnsOut = dimensionsNotQbMeasure
            .map(d => (d.dimension))
            .concat(measures.map(m => m.measure));
        const attributeKeys = attributes.map(a => a.attribute);
        return new DataSet(columnsOut, attributeKeys, mappedResults);
    };
    exports.getData = getData;
    const query = async (endPointUri, query) => {
        console.log(query);
        const headers = new Headers();
        headers.append("Accept", "application/json");
        headers.append("Content-Type", "application/x-www-form-urlencoded");
        const formData = new URLSearchParams();
        formData.append("query", query);
        const response = await fetch(endPointUri, {
            headers: headers,
            method: "POST",
            body: formData,
            mode: "cors"
        });
        const responseObject = await response.json();
        return responseObject.results.bindings.map(result => {
            const resultOut = {};
            for (const variableName in result) {
                resultOut[variableName] = result[variableName].value;
            }
            return resultOut;
        });
    };
});
