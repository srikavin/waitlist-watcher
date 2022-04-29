const axios = require("axios");

(async () => {
    const data = (await axios.get("https://app.testudo.umd.edu/soc/autocomplete/course?termId=202208&searchString=%25")).data.results;

    const config = {
        prefixes: [],
    };

    data.forEach((el, index) => {
        config.prefixes.push(el.id);
    })

    console.log(JSON.stringify(config));
})();
