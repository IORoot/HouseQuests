module.exports = function(app){

    const https = require('https');
    const axios = require('axios').default;
    const cheerio = require('cheerio');
    var { transform } = require("node-json-transform");

    // ┌─────────────────────────────────────┐
    // │          RIGHTMOVE PROPERTY         │
    // └─────────────────────────────────────┘
    app.post('/rightmoveProperty', (req, res) => {

        var marker = JSON.parse(req.body);
        var target = marker.url;

        // At instance level ignore SSL cert issues.
        const agent = new https.Agent({  
            rejectUnauthorized: false
        });

        axios({
            method: 'get',
            url: target,
            httpsAgent: agent
        })
        .then(function (response) {

            var $ = cheerio.load(response.data);
            // Robustly extract window.PAGE_MODEL JSON by bracket matching
            const scriptText = $('script').filter((i, el) => $(el).text().includes('window.PAGE_MODEL')).first().text();
            if (!scriptText){
                throw new Error('PAGE_MODEL script not found');
            }
            const markerStr = 'window.PAGE_MODEL = ';
            const startIdx = scriptText.indexOf(markerStr);
            if (startIdx === -1){
                throw new Error('PAGE_MODEL start not found');
            }
            const jsonStart = startIdx + markerStr.length;
            // Bracket matching to find end of JSON object
            let depth = 0;
            let endIdx = -1;
            let started = false;
            for (let i = jsonStart; i < scriptText.length; i++){
                const ch = scriptText[i];
                if (ch === '{') { depth++; started = true; }
                else if (ch === '}'){ depth--; if (started && depth === 0){ endIdx = i + 1; break; } }
            }
            let rawJson;
            if (endIdx === -1){
                // Fallback regex extraction
                const match = scriptText.match(/window\.PAGE_MODEL\s*=\s*(\{[\s\S]*?\});/);
                if (!match){
                    throw new Error('Unable to extract PAGE_MODEL JSON');
                }
                rawJson = match[1];
            } else {
                rawJson = scriptText.slice(jsonStart, endIdx);
            }
            let data;
            try {
                data = JSON.parse(rawJson);
            } catch (e) {
                // Try cleaning trailing characters then parse
                const cleaned = rawJson.replace(/;\s*$/, '');
                data = JSON.parse(cleaned);
            }

            var map = {
                item: {
                    id:             "propertyData.id",
                    description:    "propertyData.text.description",
                    title:          "propertyData.text.pageTitle",
                    price:          "propertyData.prices.primaryPrice",
                    floorplan:      "propertyData.floorplans[0].url",
                    longitude:      "propertyData.location.longitude",
                    latitude:       "propertyData.location.latitude",
                    postcode:       "analyticsInfo.analyticsProperty.postcode",
                    bedrooms:       "propertyData.bedrooms",
                    tenure:         "propertyData.tenure.tenureType",
                    link:           "metadata.copyLinkUrl",
                    details:        {
                        archived:           "propertyData.status.archived",
                        branch:             "propertyData.customer.branchDisplayName",
                        branchID:           "propertyData.customer.branchId",
                        branchLogo:         "propertyData.customer.logoPath",
                        branchURL:          "propertyData.customer.customerProfileUrl",
                        broadbandUrl:       "propertyData.broadband.broadbandCheckerUrl",
                        councilTaxBand:     "propertyData.livingCosts.councilTaxBand",
                        epcImage:           "propertyData.epcGraphs[0].url",
                        featuresArray:      "propertyData.keyFeatures",
                        groundRent:         "propertyData.livingCosts.annualGroundRent",
                        leaseExpiry:        "propertyData.tenure.yearsRemainingOnLease",
                        listingHistory:     "propertyData.listingHistory",
                        numberBaths:        "propertyData.bathrooms",
                        numberBeds:         "propertyData.bedrooms",
                        pricePerSqFt:       "propertyData.prices.pricePerSqFt",
                        propertyType:       "propertyData.propertySubType",
                        roomsArray:         "propertyData.rooms",
                        serviceCharge:      "propertyData.livingCosts.annualServiceCharge",
                        sharedOwnership:    "propertyData.sharedOwnership.sharedOwnership",
                        sizings:            "propertyData.sizings",
                        status:             "propertyData.status.published",
                        trainStations:      "propertyData.nearestStations",
                    }
                },

                each: function(item){
                    item.source = "rightmove";
                    item.url = "https://rightmove.co.uk/properties/"+item.id
                    if (item.details && item.details.branchURL){
                        item.details.branchURL = 'https://rightmove.co.uk' + item.details.branchURL;
                    }
                    // Inject coordinates from marker if missing
                    if (item.longitude == null && marker.longitude != null){ item.longitude = marker.longitude; }
                    if (item.latitude == null && marker.latitude != null){ item.latitude = marker.latitude; }
                    return item; 
                }
            }

            var result = transform(data, map);

            // IMAGES (hardened)
            var imageArray = []
            if (data.propertyData && Array.isArray(data.propertyData.images)){
                data.propertyData.images.forEach(function(image) {
                    if (!image) return;
                    const url = image.url || image.mainImageSrc || '';
                    const thumb = (image.resizedImageUrls && (image.resizedImageUrls.size476x317 || image.resizedImageUrls.src)) || url;
                    if (url){
                        imageArray.push({ url, thumbnail: thumb || url });
                    }
                });
            }
            result['images'] = imageArray;

            // Floorplan/EPC null-safety
            result.floorplan = result.floorplan || null;
            if (result.details){
                result.details.epcImage = result.details.epcImage || null;
            }

            // Train stations format
            if (result.details && Array.isArray(result.details.trainStations)){
                result.details.trainStations = result.details.trainStations.map(oldStation => ({
                    name: oldStation.name,
                    type: Array.isArray(oldStation.types) ? oldStation.types.join(', ') : oldStation.types,
                    distance: (Math.round((oldStation.distance || 0) * 100) / 100) + ' miles'
                }));
            }

            res.json(result)
        })
        .catch(function (error) {
            // Always respond with JSON to avoid client-side parse errors
            res.json({});
        })

    });

}