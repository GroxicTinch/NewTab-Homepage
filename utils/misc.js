const getGPS = () => {
  return new Promise((resolve) => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const latitude = position.coords.latitude;
          const longitude = position.coords.longitude;
          resolve({ latitude, longitude });
        },
        (error) => {
          console.error("Error obtaining location: ", error.message);
          // Default values
          resolve({ latitude: 404, longitude: 404 }); // Default to error location
        }
      );
    } else {
      console.log("Geolocation is not supported by this browser.");
      // Default values if geolocation is not supported
      resolve({ latitude: 404, longitude: 404 }); // Default to error location
    }
  });
};