# Berkeley Landmarks App - Interface Design

## Overview
A mobile app for exploring Berkeley, California's architectural landmarks and historic properties. The app centers on an interactive map showing landmarks, walking tour routes, and detailed property information sourced from BAHA (Berkeley Architectural Heritage Association).

## Color Palette
- **Primary**: `#1B4332` (Deep Forest Green) — evokes Berkeley's tree-lined streets and parks
- **Primary Light**: `#2D6A4F` — lighter green for accents
- **Accent**: `#D4A373` (Warm Sandstone) — references Berkeley's historic building materials
- **Background Light**: `#FEFAE0` (Warm Cream) — warm, inviting, heritage feel
- **Background Dark**: `#1A1A1A` (Near Black)
- **Surface Light**: `#FFFFFF`
- **Surface Dark**: `#2A2A2A`
- **Foreground Light**: `#1B1B1B`
- **Foreground Dark**: `#F5F5DC`
- **Muted Light**: `#6B705C` (Sage)
- **Muted Dark**: `#A3A380`
- **Border Light**: `#DDA15E33` (Translucent gold)
- **Border Dark**: `#3D405B`

## Screen List

### 1. Map Screen (Home / Tab 1)
- Full-screen interactive map centered on Berkeley (37.8716, -122.2727)
- Colored markers for landmarks by category (civic, residential, religious, commercial, educational)
- Tour route polylines shown when a tour is selected
- Bottom sheet with landmark quick-preview when marker tapped
- Filter chips at top for landmark categories
- "My Location" button
- Cluster markers when zoomed out

### 2. Tours Screen (Tab 2)
- List of BAHA walking tours organized by neighborhood
- Each tour card shows: tour name, neighborhood, number of stops, estimated distance/time
- Tour cards have a small preview map thumbnail
- Tapping a tour navigates to Tour Detail

### 3. Landmarks Screen (Tab 3)
- Searchable, filterable list of all landmarks
- Sort by: name, year built, architect, neighborhood
- Each landmark card shows: name, address, architect, year, category icon
- Quick-tap to view on map or open detail

### 4. Landmark Detail Screen (Push from Map/Landmarks)
- Hero section with landmark name, address, and category badge
- Info section: architect, year built, architectural style, landmark designation number
- Description/history text
- "View on Map" button
- BAHA notes and National Register status if applicable
- Nearby landmarks section

### 5. Tour Detail Screen (Push from Tours)
- Tour name and neighborhood header
- Tour description and author
- List of stops in order with distance between each
- "Start Tour" button that switches to map view with route highlighted
- Estimated total walking time and distance

## Primary Content and Functionality

### Map Screen
- MapView with Apple Maps (default, no API key needed for Expo Go)
- Custom markers with category-based colors
- Polyline overlays for tour routes
- Bottom sheet for landmark preview on marker tap
- Category filter chips

### Tours Screen
- FlatList of tour cards
- Each tour has: id, name, neighborhood, stops (array of landmark IDs), route coordinates
- Tour data from BAHA's 41 Walking Tours

### Landmarks Screen
- FlatList with search bar
- Filter by: category, architect, decade, neighborhood
- 50+ landmarks with full data

### Landmark Detail
- ScrollView with all property information
- Navigation to map centered on landmark

### Tour Detail
- Tour metadata + ordered stop list
- Navigate to map with tour route overlay

## Key User Flows

### Flow 1: Explore Map
1. User opens app → Map screen with all landmarks visible
2. User taps a marker → Bottom sheet slides up with landmark preview
3. User taps "View Details" → Landmark Detail screen
4. User taps "View on Map" → Returns to map centered on landmark

### Flow 2: Browse Tours
1. User taps Tours tab → List of walking tours
2. User taps a tour → Tour Detail screen with stops
3. User taps "View on Map" → Map screen with tour route highlighted and stops numbered

### Flow 3: Search Landmarks
1. User taps Landmarks tab → Full list with search bar
2. User types architect name or landmark name → Filtered results
3. User taps a landmark → Landmark Detail screen

## Tab Bar Configuration
| Tab | Icon | Label |
|-----|------|-------|
| Map | `map.fill` (SF Symbol) / `map` (Material) | Map |
| Tours | `figure.walk` / `directions-walk` | Tours |
| Landmarks | `building.columns.fill` / `account-balance` | Landmarks |
