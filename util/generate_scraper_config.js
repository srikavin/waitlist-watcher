const axios = require("axios");

const high_frequency = ["CMSC", "MATH"];

const high_frequency_cron = "*/5 * * * *";
const cron = (i) => `${Math.floor(i * 2 / 3.1)} */2 * * *`;

(async () => {

    const data = (await axios.get("https://app.testudo.umd.edu/soc/autocomplete/course?termId=202208&searchString=%25")).data.results;

    const config = {
        prefixes: [],
        high_frequency: []
    };

    data.forEach((el, index) => {
        if (high_frequency.includes(el.id)) {
            config.high_frequency.push(el.id)
        } else {
            config.prefixes.push(el.id);
        }
    })

    console.log(JSON.stringify(config));
})();
