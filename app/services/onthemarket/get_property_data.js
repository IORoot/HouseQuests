module.exports = function(app){

    const https = require('https');
    const axios = require('axios').default;
    var { transform } = require("node-json-transform");

    // ┌─────────────────────────────────────┐
    // │         ONTHEMARKET PROPERTY        │
    // └─────────────────────────────────────┘
    app.post('/onthemarketProperty', (req, res) => {

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

            let html = response.data;

            // Extract __NEXT_DATA__ script tag content
            const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
            if (!nextDataMatch) {
                throw new Error('__NEXT_DATA__ script not found');
            }

            let data = JSON.parse(nextDataMatch[1]);
            
            // Navigate to the property data in the nested structure
            if (!data.props || !data.props.initialReduxState || !data.props.initialReduxState.property) {
                throw new Error('Property data not found in __NEXT_DATA__');
            }

            data = data.props.initialReduxState.property;

            var map = {
                item: {
                    id:             "id",
                    description:    "description",
                    title:          "propertyTitle",
                    price:          "price",
                    floorplan:      "floorplans[0].largeUrl",
                    longitude:      "location.lon",
                    latitude:       "location.lat",
                    bedrooms:       "bedrooms",
                    tenure:         "keyInfo[0].value",
                    link:           "canonicalUrl",
                    details:        {
                        area:               "minimumArea",
                        branch:             "agent.name",
                        branchID:           "agent.branchId",
                        branchLogo:         "agent.logoUrl",
                        branchURL:          "agent.websiteUrl",
                        broadband:          "broadband.broadbandType",
                        dataLayer:          "headerData.dataLayer",
                        epcRating:          "epc.rating",
                        featuresArray:      "features",
                        newHome:            "newHomeFlag",
                        numberBaths:        "bathrooms",
                        numberBeds:         "bedrooms",
                        propertyType:       "humanisedPropertyType",
                        schools:            "school",
                        mobileReception:    "mobileReception",
                        trainStations:      "station",
                        councilTaxBand:     "keyInfo[1].value"
                    }
                },

                each: function(item){
                    item.source = "onthemarket";
                    item.url = "https://www.onthemarket.com/details/"+item.id

                    // Extract postcode from dataLayer if available
                    if (item.details && item.details.dataLayer){
                        try {
                            let dataLayer = JSON.parse(item.details.dataLayer)
                            item.postcode = dataLayer.postcode
                        } catch (_) {}
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
            if (Array.isArray(data.images)){
                data.images.forEach(function(image) {
                    if (!image) return;
                    const url = image.largeUrl || image.url || '';
                    if (url){
                        imageArray.push({ url, thumbnail: url }); // Use largeUrl for both to show normal images
                    }
                });
            }
            result['images'] = imageArray;

            // Closest Station
            if (data.station && Array.isArray(data.station) && data.station[0]){
                result['station'] = data.station[0].name + ' (' + data.station[0].displayDistance + ')'
            }

            // Train stations
            if (result.details && Array.isArray(result.details.trainStations)){
                result.details.trainStations.forEach(function(oldStation, index){

                    let lines = ''
                    if (Array.isArray(oldStation.allNetworks)){
                        oldStation.allNetworks.forEach(function(line){
                            lines += line.type + ', '
                        })
                    }

                    result.details.trainStations[index] = {
                        'name': oldStation.fullName || oldStation.name,
                        'type': lines,
                        'distance': oldStation.displayDistance 
                    }
                });
            }

            // schools
            if (result.details && Array.isArray(result.details.schools)){
                result.details.schools.forEach(function(oldSchool, index){

                    let report = 'N/A'
                    if (oldSchool.reportDescriptive){
                        report = oldSchool.reportDescriptive
                    }
                    
                    result.details.schools[index] = {
                        'name': oldSchool.name,
                        'distance': oldSchool.displayDistance,
                        'report': report
                    }
                })
            }

            // Loop through key-info items for additional details
            if (Array.isArray(data.keyInfo)){
                data.keyInfo.forEach(function(infoItem){
                    const title = (infoItem.title || '').toLowerCase();
                    if(title === 'tenure'){
                        result.tenure = infoItem.value
                    }                
                    if(title === 'council tax'){
                        if (!result.details) result.details = {};
                        result.details.councilTaxBand = infoItem.value
                    }
                    if(title === 'broadband'){
                        if (!result.details) result.details = {};
                        result.details.broadband = infoItem.value
                    }
                })
            }

            // Make features an Array of strings.
            if (result.details && Array.isArray(result.details.featuresArray)){
                result.details.featuresArray = result.details.featuresArray.map(item => item && item.feature ? item.feature : item).filter(Boolean)
            }

            res.json(result)
        })
        .catch(function (error) {
            // Always respond JSON so client doesn't crash
            res.json({});
        })

    });

}