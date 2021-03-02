define("query", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getDataStructureDefinition = void 0;
    /**
     * @param dataSetUri e.g. `http://gss-data.org.uk/data/gss_data/trade/ons-quarterly-country-and-regional-gdp#dataset`
     */
    const getDataStructureDefinition = async (dataSetUri, endPointUri) => {
        const sparqlQuery = `
        PREFIX qb: <http://purl.org/linked-data/cube#>

        SELECT DISTINCT ?dimension ?attribute ?measure
        WHERE {
            BIND (<${dataSetUri}> as ?dataSet).
            
            ?dataSet a qb:DataSet.
            
            {
                ?ds qb:structure/qb:component/qb:dimension ?dimension.
            } UNION {
                ?ds qb:structure/qb:component/qb:attribute ?attribute.
            } UNION {
                ?ds qb:structure/qb:component/qb:measure ?measure.
            }       
        }
    `;
        await query(endPointUri, sparqlQuery);
    };
    exports.getDataStructureDefinition = getDataStructureDefinition;
    const query = async (endPointUri, query) => {
        const headers = new Headers();
        headers.append("Accept", "application/json");
        headers.append("Content-Type", "application/x-www-form-urlencoded");
        const formData = new FormData();
        formData.append("query", query);
        const response = await fetch(endPointUri, {
            headers: headers,
            method: "POST",
            body: formData,
            mode: "cors"
        });
        const responseObject = await response.json();
        return responseObject.results.map(result => {
            const resultOut = {};
            for (const variableName in result.bindings) {
                resultOut[variableName] = result.bindings[variableName].value;
            }
            return resultOut;
        });
    };
});
define("main", ["require", "exports", "query"], function (require, exports, query_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    const tableContainer = window.document.getElementById("tableContainer");
    const main = async () => {
        const results = await query_1.getDataStructureDefinition("http://gss-data.org.uk/data/gss_data/trade/ons-quarterly-country-and-regional-gdp#dataset", "https://staging.gss-data.org.uk/sparql");
        console.log(results);
    };
    document.addEventListener("DOMContentLoaded", (event) => {
        console.log("DOCUMENT LOADED");
        main()
            .then(() => console.log("FINISHED"))
            .catch(console.error);
    });
});
