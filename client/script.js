// Globals
const verbose = false;
const renderers = [];
let map;

const DirectionsRendererOptions = {
  suppressBicyclingLayer: true,
  suppressMarkers: true,
}

function initMap() {
  
  // Render the map
  map = new google.maps.Map(document.getElementById('map'), {
    zoom: 7,
    center: {lat: 34.0522, lng: -118.2437}
  });
  
  //onChangeHandler();
}

// Updates map with given directions
const onChangeHandler = function() {
  
  // Clear the map first
  clearMap();
  
  calculateAndDisplayRoute(document.getElementById('origin').value, document.getElementById('destination').value, map);
};

function calculateAndDisplayRoute(origin, destination, map) {
  
  // Get default transit route
  const ds = new google.maps.DirectionsService;
  
  ds.route(
    {
      origin,
      destination,
      travelMode: 'TRANSIT'
    },
    async (response, status) => {
      if (status === 'OK') {
        
        let basicRoutes;
        let altRoutes;
        
        try {
          // Get routes
          basicRoutes = await getRoutes(response);

          // Get routes, preferring rail. Run again to replace walking on new route
          altRoutes = await getRoutes(response, {
            modes: ['RAIL','SUBWAY','TRAIN','TRAM'],
            routingPreference: 'FEWER_TRANSFERS'
          });
        }
        catch (err) {
          console.log('Error:', err, '(altRoute likely failed)');
          notify(err);
        }
        
        
        // Determine which route is faster
        const basicDuration = getDuration(basicRoutes);
        const altDuration = altRoutes ? getDuration(altRoutes) : Infinity;
        const routes = basicDuration <= altDuration ? basicRoutes : altRoutes;
        
        if (verbose) console.log('Alt duration (mins)', altDuration);
        if (verbose) console.log('Basic duration (mins)', basicDuration);
        
        // Plot routes
        routes.forEach(route => {
          const dr = new google.maps.DirectionsRenderer(DirectionsRendererOptions);
          dr.setMap(map);
          dr.setDirections(route);
          renderers.push(dr);
        });
        
        // Update map
        // Something is asynchronous above this that's causing problems...
        setTimeout(() => {showRoutes(response, map)}, 0);
        
        // Get durations
        const originalDuration = Math.round(response.routes[0].legs.reduce((dur, leg) => {
          return dur + leg.duration.value;
        }, 0) / 60);
        const newDuration = getDuration(routes);
        
        // Show durations on page
        try {
          // delay for query limit
          setTimeout(() => {showDurations(origin, destination, originalDuration, newDuration)},500);
        }
        catch (err) {
          console.log(err);
          notify(err);
        }
       
        
      } else {
        console.log(status);
        notify(status);
      }
    }
  );
}

// Clears the map of directions
const clearMap = () => {
  while (renderers.length > 0) {
    renderers.pop().setMap(null);
  }
}

// Returns a duration (in mins) for the given set of routes
const getDuration = (routes) => {
  return Math.round(routes.reduce((dur, route) => {
    return dur + route.routes[0].legs[0].duration.value;
  }, 0) / 60);
}

// Returns an array of routes
const getRoutes = async (response, transitOptions) => {
  // Intialize empty array of new routes
  const routes = [];

  // Iterate through steps in response
  for (step of response.routes[0].legs[0].steps) {
    // If the travel_mode is walking, set travel mode to biking
    const travelMode = step.travel_mode === 'WALKING' ? 'BICYCLING' : 'TRANSIT';

    // Push route to routes
    try {
      
      // Get route
      const route = await getRoute(step.start_location, step.end_location, travelMode, transitOptions);
      
      // If route contains any walking steps, getRoutes on that route and push into routes
      if (route.routes[0].legs[0].steps.filter(step => {return step.travel_mode === 'WALKING'}).length) {
        try {
          if (verbose) console.log('Route contains walking:', route);
          const recurseRoutes = await getRoutes(route);
          recurseRoutes.forEach(r => routes.push(r));
        }
        catch (err) {
          console.log(err);
          throw(err);
        }
      }
      
      // Else push into routes
      else routes.push(route);
    } 
    catch (err) {
      throw(err);
    }
  }
  
  return routes;
}


// Input:
  // origin (latlng)
  // destination (latlng)
  // departure_time (dateTime)
  // transit_mode (string, 'BICYCLING' or 'TRANSIT');
// Output:
  // promise that resolves to a route
const getRoute = (origin, destination, travelMode, transitOptions) => {
  // Get default transit route
  const ds = new google.maps.DirectionsService;
  
  return new Promise((resolve, reject) => {
    
    const request = {
      origin,
      destination,
      travelMode,
      transitOptions
    }
    
    ds.route(request, (response, status) => {
      if (status == 'OVER_QUERY_LIMIT') reject(status);
    
      if (verbose) console.log(`Getting ${travelMode} leg:`, request);
      if (verbose) console.log('Response:', response);
      
      if (status === 'OK') resolve(response);
      else reject(response);
    });
    
  });
}

// Input: 
  // Array of routes
  // Current map
// Output:
  // Map is zoomed to show entire route
const showRoutes = (response, map) => {
  const bounds = new google.maps.LatLngBounds();
  bounds.extend(response.routes[0].legs[0].start_location);
  bounds.extend(response.routes[0].legs[0].end_location);
  map.fitBounds(bounds);
}

// Displays durations for different modes
const showDurations = async (origin, destination, transit, multi) => {
  
  // Get driving duration
  let driving;
  try {
    driving = Math.round((await getRoute(origin, destination, 'DRIVING')).routes[0].legs.reduce((dur, leg) => {
      return dur + leg.duration.value;
    }, 0) / 60);
  }
  catch (err) {
    throw err;
    console.log(err);
  }
  
  // Get bike duration
  let bike;
  try {
    bike = Math.round((await getRoute(origin, destination, 'BICYCLING')).routes[0].legs.reduce((dur, leg) => {
      return dur + leg.duration.value;
    }, 0) / 60);
  }
  catch (err) {
    throw err;
    console.log(err);
  }
  
  // Update DOM
  document.querySelector('#driving .val').innerHTML = ` ${driving} mins`;
  document.querySelector('#transit .val').innerHTML = ` ${transit} mins`;
  document.querySelector('#multi .val').innerHTML = ` ${multi} mins`;
  document.querySelector('#bike .val').innerHTML = ` ${bike} mins`;
  
}

const notify = (msg) => {
  Materialize.toast('Error: ' + msg, 8000, 'red darken-1');
}