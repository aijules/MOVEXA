# Data Mapping from Excel to MongoDB

This document maps the columns from the provided `.xlsx` files to the MongoDB schemas.

## 1. Routes and Stops (`Routes/*-with-stops.xlsx`)

- **Source File**: `Routes/{id}-with-stops.xlsx`
- **Header Row**: Row 1 contains the Route Name (e.g., `ROUTE NAME: KABUGA ...`).
- **Data Rows**: Start from Row 4.
- **Mapping**:
  - `Route ID`: Column A (`Route`) -> e.g., `104F`.
  - `Sequence`: Column B (`End_Sequence`) -> Index of stop in route.
  - `Stop Name`: Column C (`End.Stop.with.Route`) -> `Stop.name`.
  - `Distance`: Column D (`Distance_KM`) -> `Route.stops[].distanceFromStart`.
  - `Latitude`: Column E (`End_Lat`) -> `Stop.location.coordinates[1]`.
  - `Longitude`: Column F (`End_Lon`) -> `Stop.location.coordinates[0]`.

## 2. Path Coordinates (`Routes/*-with-path.xlsx`)

- **Source File**: `Routes/{id}-with-path.xlsx`
- **Mapping**:
  - `Route ID`: Column A.
  - `Geofence/Path`: Column G (`Unnamed: 6`).
    - **Format**: A comma-separated string of `longitude,latitude,longitude,latitude...`.
    - **Action**: Split the string by commas and group into pairs to form the `LineString` coordinates.

## 3. Fleet Data (`ECOFLEET_*.xlsx`)

- **Source File**: `ECOFLEET_{MM}_{YYYY}.xlsx`
- **Mapping**:
  - `Plate`: Column C (`Plate`).
  - `Institution`: Column A (`Institution`).
  - `Date`: Column B (`Date`).
  - `Passengers`: Column E (`Passengers`).
    - **Action**: Use this to mock "occupancy" or "crowdedness" level. Higher passenger counts relative to `Standart_Boarding_Piece` (Column D) indicates a full bus.

## 4. Derived Data (Mocking)

- **Schedules**: 
  - Calculate arrival times at each stop based on `Distance_KM` and an average speed (e.g., 30 km/h).
  - Generate departures starting from 05:00 to 22:00.
- **Stop IDs**: 
  - Normalize stop names (trim, uppercase) to use as unique identifiers across different routes.

## 5. Handling Incomplete Data

- **Missing Paths**: If a route has `with-stops.xlsx` but no `with-path.xlsx`, generate a straight-line `LineString` connecting the stops in sequence.
- **Missing Stops**: If a route has `with-path.xlsx` but no `with-stops.xlsx`, treat the start and end of the path as "Terminal" stops, and optionally use the `with-stops` data from other routes to find nearby stops that this path might pass through.
