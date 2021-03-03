define(["require", "exports", "./query"], function (require, exports, query_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    const tableContainer = window.document.getElementById("tableContainer");
    const nextButton = window.document.getElementById("nextButton");
    const currentPageNumberSpan = window.document.getElementById("pageNumberDisplay");
    let currentEndPointComponents;
    let currentPage;
    const sparqlEndPointUri = "https://staging.gss-data.org.uk/sparql";
    const dataSetUri = "http://gss-data.org.uk/data/gss_data/edvp/lccc-actual-ilr-income#dataset"; // Fewest Dimensions => Fastest
    // const dataSetUri = "http://gss-data.org.uk/data/gss_data/energy/beis-sub-regional-feed-in-tariffs-confirmed-on-the-cfr-statistics#dataset"
    // const dataSetUri = "http://gss-data.org.uk/data/gss_data/trade/ons-quarterly-country-and-regional-gdp#dataset"
    // const dataSetUri = "http://gss-data.org.uk/data/gss_data/edvp/dft-electric-vehicle-charging-device-statistics-month-year-data-tables#dataset"
    // const dataSetUri = "http://gss-data.org.uk/data/gss_data/trade/hmrc-regional-trade-statistics-interactive-analysis#dataset"
    const main = async () => {
        currentPage = 1;
        currentEndPointComponents = await query_1.getDataStructureDefinition(dataSetUri, sparqlEndPointUri);
        console.log(currentEndPointComponents);
        nextButton.onclick = () => nextPageClick();
        await renderPageResults(currentPage);
    };
    const nextPageClick = () => {
        const nextPage = currentPage + 1;
        renderPageResults(nextPage)
            .then(() => {
            currentPage = nextPage;
            console.log(`Page ${nextPage} render complete`);
        })
            .catch(console.error);
    };
    const renderPageResults = async (pageNumber) => {
        console.log(`Fetching page ${pageNumber}`);
        const data = await query_1.getData(dataSetUri, sparqlEndPointUri, currentEndPointComponents, pageNumber);
        console.log(data);
        // Clean out table container if there's anything in there.
        // tableContainer.childNodes.forEach(n => n.remove())
        tableContainer.innerHTML = `
        <table>
            <thead>
                ${data.keys
            .map(k => `<th>${k}</th>`)
            .join("\n")}
            </thead>

            <tbody>
                ${data.data
            .map(record => `
                                <tr>
                                ${data.keys
            .map(k => `<td>${mapColumnValueToHtml(record[k])}</td>`)
            .join("\n")}
                                </tr>
                            `)
            .join("\n")}
            </tbody>
        </table>
    `;
        currentPageNumberSpan.innerHTML = `On page ${pageNumber}.`;
    };
    const mapColumnValueToHtml = (columnValue) => {
        if (columnValue instanceof query_1.ObservedValue) {
            const unitAttribute = columnValue.getUnitAttributeValue();
            return `
            <span class="measured-value" title="${columnValue.uri}">
                ${columnValue.value}
                <span class="unit" title="${unitAttribute.uri}">
                    ${unitAttribute.value}
                </span>
            </span>
        `;
        }
        else if (columnValue instanceof query_1.DimensionValue) {
            return `
            <span class="dimension-value" title="${columnValue.uri}">
            ${columnValue.value}
            </span>
        `;
        }
        else if (typeof columnValue === "undefined") {
            return "-";
        }
        return columnValue;
    };
    main()
        .then(() => console.log("FINISHED"))
        .catch(console.error);
});
