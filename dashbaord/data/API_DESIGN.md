# API Design for Jakdojade Clone (Mock)

This document describes the API structure for a public transport application inspired by Jakdojade, using the INES student data.

## Tech Stack
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB (with Mongoose)
- **Data Source**: Excel files (converted/loaded into MongoDB)

## Data Models

### 1. Stop
Represents a physical bus stop.
```javascript
{
  stopId: String, // e.g., "KABUGA TERMINAL"
  name: String,
  location: {
    type: "Point",
    coordinates: [Number] // [longitude, latitude]
  },
  routes: [String] // List of route IDs passing through this stop
}
```

### 2. Route
Represents a bus line.
```javascript
{
  routeId: String, // e.g., "102F", "102B"
  shortName: String, // e.g., "102"
  longName: String, // e.g., "KABUGA BUS PARK - NYABUGOGO"
  direction: String, // "FORWARD" or "BACKWARD"
  stops: [
    {
      stopId: String,
      sequence: Number,
      distanceFromStart: Number
    }
  ]
}
```

### 3. Path
The geographical line representing the route on a map.
```javascript
{
  routeId: String,
  geometry: {
    type: "LineString",
    coordinates: [[Number]] // Array of [longitude, latitude]
  }
}
```

### 4. Vehicle (Fleet)
Represents a bus and its status.
```javascript
{
  plate: String,
  institution: String,
  lastDate: Date,
  occupancy: Number, // Mocked or from ECOFLEET passengers
  status: String // "active", "idle"
}
```

## API Endpoints

### Routes
- `GET /api/routes`: Returns all available routes.
- `GET /api/routes/:routeId`: Returns details of a specific route, including its stops.
- `GET /api/routes/:routeId/path`: Returns the GeoJSON LineString for the route.

### Stops
- `GET /api/stops`: Returns all stops.
- `GET /api/stops/:stopId`: Returns details of a specific stop.
- `GET /api/stops/:stopId/schedules`: Returns mocked arrival times for this stop.

### Planner (Jakdojade Core)
- `POST /api/plan`: 
  - **Body**: `{ origin: [lon, lat], destination: [lon, lat], time: Date }`
  - **Response**: Suggested connections (routes to take, transfer points).

### Fleet
- `GET /api/vehicles`: Returns current fleet status.

## Implementation Strategy for AI Agents
1. **Data Ingestion**: Create a script using `xlsx` or `pandas` to parse the Excel files and populate MongoDB.
2. **Geospatial Queries**: Use MongoDB `$near` and `$geoWithin` for stop finding and route pathing.
3. **Mocking Schedules**: Since the data doesn't provide a fixed timetable, generate one (e.g., every 15-30 mins) for each route.
4. **Mocking Real-time**: Use the `ECOFLEET` data to simulate vehicle positions and "crowdedness".
