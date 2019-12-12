const foursquareV = '20191212';

$(document).ready(() => {
  let exploreResult = null;

  const getRecommendedVenues = () => {
    if (!exploreResult) {
      return [];
    }
    let group = exploreResult.groups.filter(g => g.name === 'recommended');
    group = group && group.length ? group[0] : null;
    if (!group) {
      return [];
    }
    return group.items.map(i => i.venue);
  };

  const creatUrl = (baseUrl, params = {}) =>
    `${baseUrl}?${Object.keys(params).map(key => `${key}=${encodeURIComponent(params[key])}`).join('&')}`;
  
  const getLocationFromIP = () => new Promise((resolve, reject) => {
    const success = response => {
      resolve({
        lat: parseFloat(response.latitude),
        lng: parseFloat(response.longitude)
      });
    };

    const failed = response => {
      reject(response);
    };

    $.ajax({
      url: creatUrl('https://api.ipgeolocation.io/ipgeo', {apiKey: CONFIG.IP_GEOLOCATION_API_KEY}),
      method: 'GET',
      success: success,
      error: failed
    });
  });

  const exploreVenues = (latitude, longitude) => new Promise((resolve, reject) => {
    const success = response => {
      if (response.meta && response.meta.code === 200) {
        resolve(response.response);
      } else {
        reject('Error');
      }
    };

    const failed = error => {
      reject(error);
    }

    const requestUrl = creatUrl('https://api.foursquare.com/v2/venues/explore', {
      client_id: CONFIG.FOURSQUARE_CLIENT_ID,
      client_secret: CONFIG.FOURSQUARE_CLIENT_SECRET,
      v: foursquareV,
      ll: `${latitude},${longitude}`
    });

    $.ajax({
      url: requestUrl,
      method: 'GET',
      success: success,
      error: failed
    });
  });

  const createListItem = venue => $(`<li><a href="#">${venue.name}</a></li>`);

  const updateHomeList = () => {
    const $venuesList = $('#venues-list');
    $venuesList.find('li').remove();
    if (!exploreResult) {
      return;
    }

    const venues = getRecommendedVenues();
    $.each(venues, (index, venue) => {
      $venuesList.append(createListItem(venue));
    });
    $venuesList.listview('refresh');
  };

  const init = async() => {
    try {
      $.mobile.loading('show');
      const location = await getLocationFromIP();
      exploreResult = await exploreVenues(location.lat, location.lng);
      updateHomeList();
      $.mobile.loading('hide');
    } catch (error) {
      console.error(error);
      $.mobile.loading('hide');
    }
  };

  init();
});
