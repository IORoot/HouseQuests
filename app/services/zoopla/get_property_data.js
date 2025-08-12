// This now uses Puppeteer to scrape Zoopla!
module.exports = function(app){

    // ┌─────────────────────────────────────┐
    // │           ZOOPLA Property           │
    // └─────────────────────────────────────┘
    app.post('/zooplaProperty', async (req, res) => {

        var marker = JSON.parse(req.body);
        var target = marker.url;
        var { transform } = require("node-json-transform");

        // Debug: Log the complete marker object
        console.log('Complete marker object received:', JSON.stringify(marker, null, 2));

        // Setup Puppeteer with bundled Chromium
        const puppeteer = require('puppeteer');

        async function main() {
            let browser;
            try {
                // Launch browser with bundled Chromium
                browser = await puppeteer.launch({ 
                    headless: true,
                    args: [
                        '--no-sandbox', 
                        '--disable-setuid-sandbox',
                        '--disable-web-security',
                        '--disable-features=VizDisplayCompositor',
                        '--disable-dev-shm-usage',
                        '--disable-accelerated-2d-canvas',
                        '--no-first-run',
                        '--no-zygote',
                        '--disable-gpu'
                    ]
                });

                // Visit Target
                const page = await browser.newPage();
                
                // Set realistic browser properties to bypass Cloudflare
                await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
                await page.setViewport({ width: 1920, height: 1080 });
                await page.setExtraHTTPHeaders({
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Upgrade-Insecure-Requests': '1'
                });
                
                await page.goto(target);
                
                // Wait for Cloudflare challenge to complete
                await page.waitForFunction(() => {
                    return document.title !== 'www.zoopla.co.uk' && 
                           !document.body.textContent.includes('Verifying you are human') &&
                           !document.body.textContent.includes('This may take a few seconds');
                }, { timeout: 60000 }); // 60 seconds timeout
                
                // Add human-like behavior
                await page.mouse.move(Math.random() * 1000, Math.random() * 1000);
                await page.mouse.wheel({ deltaY: Math.random() * 100 });
                
                // Wait a bit more for any dynamic content to load
                await new Promise(resolve => setTimeout(resolve, 3000));
        
                // Extract JSON data from the script tag
                const jsonData = await page.evaluate(() => {
                    // Try to find __NEXT_DATA__ script tag first
                    const scriptElement = document.getElementById('__NEXT_DATA__');
                    if (scriptElement) {
                        try {
                            const jsonDataString = scriptElement.textContent;
                            return JSON.parse(jsonDataString);
                        } catch (e) {
                            console.log('Error parsing __NEXT_DATA__:', e.message);
                        }
                    }
                    
                    // Look for other script tags with property data
                    const allScripts = document.querySelectorAll('script');
                    console.log('Available script tags:', Array.from(allScripts).map(s => ({ id: s.id, src: s.src, type: s.type })));
                    
                    // Look for JSON-LD structured data
                    const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
                    if (jsonLdScripts.length > 0) {
                        console.log('Found JSON-LD scripts:', jsonLdScripts.length);
                        for (let script of jsonLdScripts) {
                            try {
                                const jsonLdData = JSON.parse(script.textContent);
                                console.log('JSON-LD data:', jsonLdData);
                                if (jsonLdData['@type'] === 'Product' || jsonLdData['@type'] === 'House') {
                                    return { props: { pageProps: { listingDetails: jsonLdData } } };
                                }
                            } catch (e) {
                                console.log('Error parsing JSON-LD:', e.message);
                            }
                        }
                    }
                    
                    // Look for other script tags that might contain property data
                    for (let script of allScripts) {
                        if (script.textContent && (script.textContent.includes('property') || script.textContent.includes('listing') || script.textContent.includes('zoopla'))) {
                            try {
                                const scriptData = JSON.parse(script.textContent);
                                console.log('Found script with property data:', scriptData);
                                if (scriptData.property || scriptData.listing || scriptData.zoopla) {
                                    return { props: { pageProps: { listingDetails: scriptData } } };
                                }
                            } catch (e) {
                                // Not JSON, skip
                            }
                        }
                    }
                    
                    // Look for window variables that might contain property data
                    if (window.propertyData || window.listingData || window.zooplaData) {
                        console.log('Found window property data:', window.propertyData || window.listingData || window.zooplaData);
                        return { props: { pageProps: { listingDetails: window.propertyData || window.listingData || window.zooplaData } } };
                    }
                    
                    console.log('No reliable data source found, falling back to HTML scraping');
                    
                    // Fallback to HTML scraping (less reliable)
                    const propertyData = {
                        listingId: window.location.pathname.split('/').pop() || '',
                        title: document.querySelector('h1')?.textContent?.trim() || '',
                        price: document.querySelector('p:first-of-type')?.textContent?.trim() || '',
                        detailedDescription: Array.from(document.querySelectorAll('p')).find(p => 
                            p.textContent.includes('Stunning') || 
                            p.textContent.includes('Beautiful') || 
                            p.textContent.includes('Charming') ||
                            p.textContent.length > 100
                        )?.textContent?.trim() || '',
                        counts: {
                            numBedrooms: parseInt(document.querySelector('img[alt*="bed"]')?.parentElement?.textContent?.match(/\d+/)?.[0] || '0'),
                            numBaths: parseInt(document.querySelector('img[alt*="bath"]')?.parentElement?.textContent?.match(/\d+/)?.[0] || '0')
                        },
                        tenure: Array.from(document.querySelectorAll('li')).find(li => 
                            li.textContent.includes('Freehold') || 
                            li.textContent.includes('Leasehold')
                        )?.textContent?.trim() || '',
                        branch: {
                            name: Array.from(document.querySelectorAll('p')).find(p => 
                                p.textContent.includes('Mann') || 
                                p.textContent.includes('agent') ||
                                p.textContent.includes('Sales')
                            )?.textContent?.trim() || ''
                        },
                        address: document.querySelector('h1')?.textContent?.split(',').slice(-2).join(',').trim() || '',
                        features: {
                            bullets: Array.from(document.querySelectorAll('[class*="feature"]')).map(f => f.textContent.trim())
                        },
                        propertyImage: (() => {
                            // Try multiple selectors to find property images
                            let images = [];

                            // Helper to resolve best URL from img/picture
                            const resolveUrlFromImg = (imgEl) => {
                                if (!imgEl) return '';
                                // Prefer src attribute if present and absolute
                                let src = imgEl.getAttribute('src') || '';
                                const dataSrc = imgEl.getAttribute('data-src') || imgEl.getAttribute('data-lazy') || '';
                                const srcset = imgEl.getAttribute('srcset') || '';

                                const pickFromSrcset = (set) => {
                                    // srcset format: "url1 w1, url2 w2, ..."
                                    const first = set.split(',')[0]?.trim() || '';
                                    const urlOnly = first.split(' ')[0] || '';
                                    return urlOnly;
                                };

                                if (!src && dataSrc) src = dataSrc;
                                if ((!src || src.startsWith('data:')) && srcset) src = pickFromSrcset(srcset);

                                // If still empty, check <picture><source></source></picture>
                                if (!src || src.startsWith('data:')) {
                                    const picture = imgEl.closest('picture');
                                    if (picture) {
                                        const source = picture.querySelector('source[srcset]');
                                        if (source) {
                                            src = pickFromSrcset(source.getAttribute('srcset'));
                                        }
                                    }
                                }

                                try {
                                    // Make absolute URL if relative
                                    const a = document.createElement('a');
                                    a.href = src;
                                    return a.href;
                                } catch (e) {
                                    return src || '';
                                }
                            };

                            // Method 1: Look for images with "Property photo" in alt text
                            let photoImages = document.querySelectorAll('img[alt*="Property photo"]');
                            // Method 2: Look for images in the gallery section
                            let galleryImages = document.querySelectorAll('.gallery img, [class*="gallery"] img, [class*="photo"] img');
                            // Method 3: All images on page
                            let allImages = document.querySelectorAll('img');

                            if (photoImages.length > 0) {
                                images = Array.from(photoImages);
                            } else if (galleryImages.length > 0) {
                                images = Array.from(galleryImages);
                            } else {
                                images = Array.from(allImages).filter(img => img && (img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('srcset')));
                            }

                            const processed = images.map((img, index) => {
                                const absUrl = resolveUrlFromImg(img);
                                // Derive filename only if it's a zoocdn URL pattern
                                let filename = '';
                                try {
                                    const u = new URL(absUrl);
                                    if (u.hostname.includes('zoocdn.com')) {
                                        filename = u.pathname.split('/').pop() || '';
                                    }
                                } catch (e) {}
                                return filename ? { filename } : { url: absUrl };
                            }).filter(item => (item.filename && item.filename !== '') || (item.url && item.url !== ''));

                            return processed;
                        })()
                    };
                    
                    // Try to extract bedrooms and bathrooms from the title or description
                    const titleText = document.querySelector('h1')?.textContent || '';
                    const bedMatch = titleText.match(/(\d+)\s*bed/);
                    const bathMatch = titleText.match(/(\d+)\s*bath/);
                    
                    if (bedMatch) {
                        propertyData.counts.numBedrooms = parseInt(bedMatch[1]);
                    }
                    if (bathMatch) {
                        propertyData.counts.numBaths = parseInt(bathMatch[1]);
                    }
                    
                    // Extract listing ID from URL
                    const urlParts = window.location.pathname.split('/');
                    propertyData.listingId = urlParts[urlParts.length - 2] || '';
                    
                    console.log('Extracted property data:', propertyData);
                    
                    return { props: { pageProps: { listingDetails: propertyData } } };
                });
        
                // Uncomment to output the incoming data.
                console.log('JSON data from Zoopla:', jsonData);
                console.log('Original marker coordinates:', { longitude: marker.longitude, latitude: marker.latitude });
                
                if (!jsonData || !jsonData.props || !jsonData.props.pageProps || !jsonData.props.pageProps.listingDetails) {
                    throw new Error('Required property data not found in __NEXT_DATA__ script tag');
                }
                
                data = jsonData.props.pageProps.listingDetails

                var map = {
                    item: {
                        id:             "listingId",
                        description:    "detailedDescription",
                        title:          "title",
                        price:          "price",
                        floorplan:      "floorPlan.image[0].filename",
                        longitude:      "longitude",
                        latitude:       "latitude",
                        bedrooms:       "counts.numBedrooms",
                        tenure:         "tenure",
                        details:        {
                            area:               "floorArea",
                            auction:            "pricing.isAuction",
                            branch:             "branch.name",
                            branchID:           "branch.branchId",
                            branchLogo:         "branch.logoUrl",
                            branchURL:          "branch.branchResultsUri",
                            category:           "category",
                            chain:              "analyticsTaxonomy.chainFree",
                            councilTaxBand:     "councilTaxBand",
                            deposit:            "deposit.label",
                            epcImage:           "epc.image[0].filename",
                            featuresArray:      "features.bullets",
                            furnishedState:     "analyticsTaxonomy.furnishedState",
                            groundRent:         "groundRent.label",
                            leaseExpiry:        "leaseExpiry.yearsRemaining",
                            listingCondition:   "analyticsTaxonomy.listingCondition",
                            numberBaths:        "counts.numBaths",
                            numberBeds:         "counts.numBedrooms",
                            pointsOfInterest:   "pointsOfInterest",
                            propertyType:       "propertyType",
                            published:          "publishedOn",
                            retirementHome:     "analyticsTaxonomy.isRetirementHome",
                            section:            "section",
                            serviceCharge:      "serviceCharge",
                            sharedOwnership:    "analyticsTaxonomy.isSharedOwnership",
                            size:               "analyticsTaxonomy.sizeSqFeet",
                            statisticsArray:    "marketStats",
                            postalIncode:       "analyticsTaxonomy.incode",
                            postalOutcode:      "analyticsTaxonomy.outcode",
                        }
                    },
                    each: function(item){
                        item.source = "zoopla";
                        item.url = "https://zoopla.co.uk/for-sale/details/"+item.id
                        item.postcode =  item.details.postalOutcode + " " + item.details.postalIncode
                        item.link = "https://zoopla.co.uk/for-sale/details/"+item.id
                        
                        // Only set floorplan if it exists
                        if (item.floorplan && item.floorplan !== 'undefined') {
                            const cleanFloor = String(item.floorplan).split(':')[0];
                            item.floorplan = cleanFloor ? "https://lid.zoocdn.com/u/1600/1200/"+cleanFloor : null;
                        } else {
                            item.floorplan = null; // Set to null instead of undefined
                        }
                        
                        if (item.details.epcImage && item.details.epcImage !== 'undefined'){
                            const cleanEpc = String(item.details.epcImage).split(':')[0];
                            item.details.epcImage = cleanEpc ? "https://lid.zoocdn.com/u/1600/1200/"+cleanEpc : null;
                        } else {
                            item.details.epcImage = null;
                        }
                        
                        // Add coordinates from the original marker data
                        item.longitude = marker.longitude;
                        item.latitude = marker.latitude;
                        
                        return item; 
                    }
                }
            
                var result = transform(data, map);

                // IMAGES
                // Convert Images array to a standard list of URLs. 
                // [ 'url': 'www', 'url': 'www', ...]
                var imageArray = []
                console.log('Property image data:', data.propertyImage);
                
                if (data.propertyImage && Array.isArray(data.propertyImage)) {
                    data.propertyImage.forEach(function(image, index) {
                        console.log('Processing image', index, ':', image);
                        if (image) {
                            // If we already have absolute url from scraping, accept it
                            if (image.url) {
                                imageArray.push({ url: image.url, thumbnail: image.url });
                            } else if (image.filename && image.filename !== '') {
                                const cleanFile = String(image.filename).split(':')[0];
                                if (cleanFile) {
                                    imageArray.push({ 
                                        url: "https://lid.zoocdn.com/u/1600/1200/" + cleanFile,
                                        thumbnail: "https://lid.zoocdn.com/u/480/360/" + cleanFile
                                    });
                                }
                            }
                        }
                    });
                }
                result['images'] = imageArray;
                console.log('Final image array:', imageArray);

                // Train stations & Schools
                result.details.schools = []
                result.details.trainStations = []
                if (data.pointsOfInterest){

                    // trains
                    data.pointsOfInterest.forEach(function(poi, index) {
                        if (!(poi.type == "london_underground_station") || (poi.type == "national_rail_station")){
                            return
                        }
                        let newStation = {
                            'name': poi.title,
                            'type': poi.type,
                            'distance': Math.round(poi.distanceMiles * 100) / 100 + ' miles'
                        }

                        result.details.trainStations.push(newStation)
                    });

                    // schools
                    data.pointsOfInterest.forEach(function(poi, index) {
                        if ((poi.type == "london_underground_station") || (poi.type == "national_rail_station")){
                            return
                        }
                        let newSchool = {
                            'name': poi.title,
                            'distance': Math.round(poi.distanceMiles * 100) / 100 + ' miles',
                            'report': 'Not Supplied'
                        }

                        result.details.schools.push(newSchool)
                    });
                }
    
                // Close browser and send response
                await browser.close();
                res.send(result)

            } catch (error) {
                console.error('Error extracting JSON data:', error);
                // Close browser on error and send error response
                if (browser) {
                    await browser.close();
                }
                res.status(500).send('Error loading property details');
            }
           
        }

        // Call main function directly
        main();

        

    });
}