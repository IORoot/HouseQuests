module.exports = function (app) {
    const url = require('url');
    const puppeteer = require('puppeteer');

    app.post('/zooplaAllMap', async (req, res) => {
        try {
            console.log('=== ZOOPLA ALL MAP REQUEST STARTED ===');
            const target = req.body;
            console.log('Target URL:', target);

            if (!target) {
                res.status(400).send('No target URL provided');
                return;
            }

            let totalCount = 0;
            let totalResults = [];

            // Launch Puppeteer with bundled Chromium
            const browser = await puppeteer.launch({ 
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

            // Get url parts
            const addressParts = url.parse(target, true);
            console.log('addressParts.path: ' + addressParts.path);

            // Set total count and pagination
            totalCount = 500; // Default total count
            let pagination = 1; // Just scrape page 1 since we get enough properties

            // Scrape properties using Puppeteer - just page 1
            for (let pageNum = 1; pageNum <= pagination; pageNum++) {
                console.log(`=== STARTING PAGE ${pageNum} ===`);
                const pageUrl = `${target}&pn=${pageNum}`;
                
                try {
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
                    
                    // Add random delay before navigation to look more human
                    await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 1000));
                    
                    await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 30000 });
                    
                    // Wait for Cloudflare challenge to complete
                    await page.waitForFunction(() => {
                        return document.title !== 'Just a moment...' && 
                               !document.body.textContent.includes('Verify you are human');
                    }, { timeout: 60000 }); // Increased timeout to 60 seconds
                    
                    // Add human-like behavior
                    await page.mouse.move(Math.random() * 1000, Math.random() * 1000);
                    await page.mouse.wheel({ deltaY: Math.random() * 100 });
                    
                    // Wait a bit more for any dynamic content to load
                    await new Promise(resolve => setTimeout(resolve, 3000)); // Increased wait time
                    
                    // Debug: Take a screenshot and log page info
                    await page.screenshot({ path: `debug_page_${pageNum}.png` });
                    console.log(`Page ${pageNum} loaded:`, pageUrl);
                    console.log(`Page title:`, await page.title());
                    
                    // Log some page content for debugging
                    const pageContent = await page.evaluate(() => {
                        return {
                            title: document.title,
                            bodyText: document.body.textContent.substring(0, 500),
                            links: Array.from(document.querySelectorAll('a')).slice(0, 10).map(a => ({
                                href: a.href,
                                text: a.textContent.substring(0, 100)
                            }))
                        };
                    });
                    console.log('Page content sample:', pageContent);
                    
                    // Extract property data from the page
                    const properties = await page.evaluate(() => {
                        // Try to extract from __NEXT_DATA__ script tag first (like the working scraper)
                        const scriptElement = document.getElementById('__NEXT_DATA__');
                        if (scriptElement) {
                            try {
                                const jsonData = JSON.parse(scriptElement.textContent);
                                if (jsonData.props && jsonData.props.pageProps && jsonData.props.pageProps.listings) {
                                    const listings = jsonData.props.pageProps.listings;
                                    console.log('Found __NEXT_DATA__ with', listings.length, 'listings');
                                    
                                    return listings.map(listing => ({
                                        id: parseInt(listing.listingId),
                                        longitude: parseFloat(listing.pos?.lng),
                                        latitude: parseFloat(listing.pos?.lat),
                                        price: listing.priceTitle || listing.price,
                                        bedrooms: listing.beds || listing.bedrooms,
                                        address: listing.address,
                                        description: listing.description,
                                        url: `https://zoopla.co.uk/for-sale/details/${listing.listingId}`,
                                        source: 'zoopla',
                                        // Additional fields for property details
                                        title: listing.title,
                                        detailedDescription: listing.description,
                                        floorArea: listing.floorArea,
                                        propertyType: listing.propertyType,
                                        tenure: listing.tenure,
                                        features: listing.features || [],
                                        images: listing.images || [],
                                        branch: listing.branch,
                                        published: listing.publishedOn,
                                        category: listing.category
                                    }));
                                }
                            } catch (e) {
                                console.log('Error parsing __NEXT_DATA__:', e.message);
                            }
                        }
                        
                        // Fallback to DOM scraping if __NEXT_DATA__ not available
                        console.log('Falling back to DOM scraping...');
                        const propertyCards = document.querySelectorAll('a[href*="/for-sale/details/"]');
                        const results = [];
                        
                        propertyCards.forEach((card, index) => {
                            const priceElement = card.querySelector('p:first-child') || 
                                               card.querySelector('[class*="price"]') ||
                                               card.querySelector('span:first-child');
                            
                            const bedsElement = card.querySelector('p:nth-child(2)') || 
                                              card.querySelector('[class*="bed"]') ||
                                              card.querySelector('span:nth-child(2)');
                            
                            const addressElement = card.querySelector('p:nth-child(3)') || 
                                                 card.querySelector('[class*="address"]') ||
                                                 card.querySelector('span:nth-child(3)');
                            
                            const descriptionElement = card.querySelector('p:nth-child(4)') || 
                                                     card.querySelector('[class*="description"]') ||
                                                     card.querySelector('span:nth-child(4)');
                            
                            const featuresElement = card.querySelector('ul') || 
                                                  card.querySelector('[class*="features"]');
                            
                            if (priceElement && bedsElement) {
                                const price = priceElement.textContent.trim();
                                const beds = bedsElement.textContent.trim();
                                const address = addressElement ? addressElement.textContent.trim() : '';
                                const description = descriptionElement ? descriptionElement.textContent.trim() : '';
                                
                                // Extract property ID from URL
                                const url = card.href;
                                const propertyId = url.match(/\/for-sale\/details\/(\d+)/)?.[1];
                                
                                // Extract features
                                const features = [];
                                if (featuresElement) {
                                    featuresElement.querySelectorAll('li').forEach(li => {
                                        features.push(li.textContent.trim());
                                    });
                                }
                                
                                console.log(`Found property: ${price} - ${beds} - ${address}`);
                                
                                results.push({
                                    id: propertyId,
                                    price: price,
                                    bedrooms: beds,
                                    address: address,
                                    description: description,
                                    features: features,
                                    url: url,
                                    source: 'zoopla',
                                    // Note: DOM scraping doesn't give us coordinates
                                    // We'll need to handle this case
                                    longitude: null,
                                    latitude: null
                                });
                            } else {
                                console.log(`Skipping card ${index} - missing price or beds elements`);
                                console.log('Price element:', priceElement);
                                console.log('Beds element:', bedsElement);
                            }
                        });
                        
                        console.log('Total properties found:', results.length);
                        return results;
                    });
                    
                    // Filter out properties without coordinates (map needs them)
                    const validProperties = properties.filter(prop => prop.longitude && prop.latitude);
                    console.log(`Page ${pageNum}: Found ${properties.length} total properties, ${validProperties.length} with coordinates`);
                    
                    totalResults = totalResults.concat(validProperties);
                    
                    await page.close();
                    
                    // Add delay between requests to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    console.log(`Scraped page ${pageNum}, found ${properties.length} properties`);
                    console.log(`=== FINISHED PAGE ${pageNum} ===`);
                    
                } catch (error) {
                    console.log(`Error scraping page ${pageNum}: ${error.message}`);
                    
                    // If it's a timeout, try one more time with longer wait
                    if (error.message.includes('timeout') || error.message.includes('exceeded')) {
                        console.log(`Retrying page ${pageNum} with longer timeout...`);
                        try {
                            await page.close();
                            const retryPage = await browser.newPage();
                            
                            // Set realistic browser properties
                            await retryPage.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
                            await retryPage.setViewport({ width: 1920, height: 1080 });
                            
                            // Longer delay before retry
                            await new Promise(resolve => setTimeout(resolve, 5000));
                            
                            await retryPage.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 60000 });
                            
                            // Wait for Cloudflare with longer timeout
                            await retryPage.waitForFunction(() => {
                                return document.title !== 'Just a moment...' && 
                                       !document.body.textContent.includes('Verify you are human');
                            }, { timeout: 90000 }); // 90 seconds for retry
                            
                            // Extract properties from retry page
                            const retryProperties = await retryPage.evaluate(() => {
                                // Try to extract from __NEXT_DATA__ script tag first
                                const scriptElement = document.getElementById('__NEXT_DATA__');
                                if (scriptElement) {
                                    try {
                                        const jsonData = JSON.parse(scriptElement.textContent);
                                        if (jsonData.props && jsonData.props.pageProps && jsonData.props.pageProps.listings) {
                                            const listings = jsonData.props.pageProps.listings;
                                            console.log('Retry: Found __NEXT_DATA__ with', listings.length, 'listings');
                                            
                                            return listings.map(listing => ({
                                                id: parseInt(listing.listingId),
                                                longitude: parseFloat(listing.pos?.lng),
                                                latitude: parseFloat(listing.pos?.lat),
                                                price: listing.priceTitle || listing.price,
                                                bedrooms: listing.beds || listing.bedrooms,
                                                address: listing.address,
                                                description: listing.description,
                                                url: `https://zoopla.co.uk/for-sale/details/${listing.listingId}`,
                                                source: 'zoopla',
                                                // Additional fields for property details
                                                title: listing.title,
                                                detailedDescription: listing.description,
                                                floorArea: listing.floorArea,
                                                propertyType: listing.propertyType,
                                                tenure: listing.tenure,
                                                features: listing.features || [],
                                                images: listing.images || [],
                                                branch: listing.branch,
                                                published: listing.publishedOn,
                                                category: listing.category
                                            }));
                                        }
                                    } catch (e) {
                                        console.log('Retry: Error parsing __NEXT_DATA__:', e.message);
                                    }
                                }
                                
                                // Fallback to DOM scraping
                                const propertyCards = document.querySelectorAll('a[href*="/for-sale/details/"]');
                                const results = [];
                                
                                propertyCards.forEach((card, index) => {
                                    const priceElement = card.querySelector('p:first-child') || 
                                                       card.querySelector('[class*="price"]') ||
                                                       card.querySelector('span:first-child');
                                    
                                    const bedsElement = card.querySelector('p:nth-child(2)') || 
                                                      card.querySelector('[class*="bed"]') ||
                                                      card.querySelector('span:nth-child(2)');
                                    
                                    const addressElement = card.querySelector('p:nth-child(3)') || 
                                                         card.querySelector('[class*="address"]') ||
                                                         card.querySelector('span:nth-child(3)');
                                    
                                    const descriptionElement = card.querySelector('p:nth-child(4)') || 
                                                             card.querySelector('[class*="description"]') ||
                                                             card.querySelector('span:nth-child(4)');
                                    
                                    const featuresElement = card.querySelector('ul') || 
                                                          card.querySelector('[class*="features"]');
                                    
                                    if (priceElement && bedsElement) {
                                        const price = priceElement.textContent.trim();
                                        const beds = bedsElement.textContent.trim();
                                        const address = addressElement ? addressElement.textContent.trim() : '';
                                        const description = descriptionElement ? descriptionElement.textContent.trim() : '';
                                        
                                        const url = card.href;
                                        const propertyId = url.match(/\/for-sale\/details\/(\d+)/)?.[1];
                                        
                                        const features = [];
                                        if (featuresElement) {
                                            featuresElement.querySelectorAll('li').forEach(li => {
                                                features.push(li.textContent.trim());
                                            });
                                        }
                                        
                                        results.push({
                                            id: propertyId,
                                            price: price,
                                            bedrooms: beds,
                                            address: address,
                                            description: description,
                                            features: features,
                                            url: url,
                                            source: 'zoopla',
                                            longitude: null,
                                            latitude: null
                                        });
                                    }
                                });
                                
                                return results;
                            });
                            
                            // Filter retry properties for valid coordinates
                            const validRetryProperties = retryProperties.filter(prop => prop.longitude && prop.latitude);
                            console.log(`Retry successful for page ${pageNum}: Found ${retryProperties.length} total properties, ${validRetryProperties.length} with coordinates`);
                            
                            totalResults = totalResults.concat(validRetryProperties);
                            console.log(`Retry successful for page ${pageNum}, found ${retryProperties.length} properties`);
                            
                            await retryPage.close();
                            
                        } catch (retryError) {
                            console.log(`Retry failed for page ${pageNum}: ${retryError.message}`);
                        }
                    }
                    
                    // Continue to next page instead of breaking
                    continue;
                }
            }

            console.log('=== SCRAPING LOOP COMPLETED ===');
            console.log('About to close browser...');
            console.log('totalResults before processing:', totalResults.length);
            console.log('totalResults type:', typeof totalResults);
            console.log('totalResults is array:', Array.isArray(totalResults));

            // Cleanup Puppeteer
            await browser.close();
            console.log('Browser closed successfully');

            console.log('=== FINAL RESULTS ===');
            console.log('Total properties found:', totalResults.length);
            if (totalResults.length > 0) {
                console.log('Sample property structure:', JSON.stringify(totalResults[0], null, 2));
                console.log('All property IDs:', totalResults.map(p => p.id).slice(0, 10));
                console.log('All property coordinates:', totalResults.map(p => ({id: p.id, lng: p.longitude, lat: p.latitude})).slice(0, 5));
            }

            // Ensure we're sending valid data
            if (!Array.isArray(totalResults)) {
                console.error('ERROR: totalResults is not an array!');
                res.status(500).send('Invalid data format');
                return;
            }

            console.log('Sending response with', totalResults.length, 'properties');
            res.send(totalResults);
            
        } catch (error) {
            console.log('Error in get_map_data_all:', error);
            res.status(500).send('Internal server error');
        }
    });

    return app;
};