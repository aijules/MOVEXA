# Mock Data Generation Strategy

Since the provided data focuses on routes, stops, and usage stats, some core Jakdojade features need "synthetic" data. Use this strategy to generate it.

## 1. Timetables (Schedules)
For each route, generate departures from the terminal (Sequence 0) every 20 minutes from 05:00 to 21:00.
- **Travel Time Estimation**: Assume an average speed of 25 km/h.
- **Calculation**: `Arrival Time at Stop N = Departure Time at Terminal + (Distance_KM[N] / 25) hours`.
- **Result**: A collection of `Schedule` documents linking `Route`, `Stop`, and `Time`.

## 2. Real-time Vehicle Positions
Simulate moving buses on the map.
- **Logic**: For each active departure in the `Schedule`, interpolate the current position based on the current time and the `Path` coordinates.
- **Realism**: Use `ECOFLEET` passenger data to set the `occupancy` field. A higher `Passengers` count in the Excel file for a specific `Plate` should correspond to a "Crowded" status in the API.

## 3. Trip Planner (Routing Engine)
Implement a simple Dijkstra or A* algorithm to find paths between stops.
- **Graph**: Stops are nodes, routes are edges with weights based on travel time.
- **Transfers**: Allow transfers between routes if they share a common stop.

## 4. Ticket Pricing (Static)
Provide a static set of ticket options:
- Single journey: 500 RWF
- Daily pass: 2000 RWF
- Monthly student pass: 15000 RWF

## 5. User Feedback (Mocked)
Simulate a few user reviews and "delay" reports for specific routes to make the app feel "alive".
