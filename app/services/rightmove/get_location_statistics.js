module.exports = function(app){

    const https = require('https');
    const axios = require('axios').default;
    const cheerio = require('cheerio');
    var { transform } = require("node-json-transform");

    // ┌─────────────────────────────────────┐
    // │          RIGHTMOVE PROPERTY         │
    // └─────────────────────────────────────┘
    app.post('/locationStatistics', (req, res) => {

        var postcode = JSON.parse(req.body);

        // lowercase and hyphenated
        if (typeof postcode === 'string') {
            postcode = postcode.replace(/\s+/g, '-').toLowerCase();
        } else {
            // Fallback to safe empty response
            return res.json({});
        }

        // At instance level ignore SSL cert issues.
        const agent = new https.Agent({  
            rejectUnauthorized: false
        });

        axios({
            method: 'get',
            url: 'https://www.rightmove.co.uk/house-prices/'+postcode+'.html?radius=0.25',
            // headers:{ 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/31.0.1650.63 Safari/537.36' },
            httpsAgent: agent
        })
        .then(function (response) {

            var $ = cheerio.load(response.data);

            var modeldata = $('script:contains("__PRELOADED_STATE__")').text().split(';');

            var data = modeldata.toString().replace('window.__PRELOADED_STATE__ = ', '');

            data = JSON.parse(data);

            res.json(data)
        })
        .catch(function (error) {
            // Always respond with valid JSON to avoid client parse errors
            res.json({});
        })

    });

}