# Berkeley Landmarks App - Interface Design

## Overview
A mobile app for exploring Berkeley, California's architectural landmarks and historic properties, with content sourced from BAHA (Berkeley Architectural Heritage Association).

### Design Concept: "A Book, Not a Map"
Inspired by the Showa design books shared during ideation. The app reads like a beautifully typeset book about Berkeley's landmarks and their history:
- **Landmarks and their stories are the product** — the map is a supporting reference, not the home
- Editorial, page-like layouts: generous margins, strong typography, chapter-like navigation (tours read as chapters, landmarks as entries)
- The map is never a top-level destination — it's reachable from a landmark or tour when you ask "where is this?"

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

### 1. Landmarks Screen (Home / Tab 1)
- Book-style searchable, filterable list of all landmarks (the "index" of the book)
- Sort by: name, year built, architect, neighborhood
- Each landmark entry shows: name, address, architect, year, category icon
- Tapping an entry opens Landmark Detail ("View on Map" lives there)

### 2. Tours Screen (Tab 2)
- Book-style list of BAHA walking tours organized by neighborhood (tours read like chapters)
- Each tour card shows: tour name, neighborhood, number of stops, estimated distance/time
- Tapping a tour navigates to Tour Detail

### 3. Map Screen (Push only — NOT a tab)
- Full-screen interactive map centered on Berkeley (37.8716, -122.2727)
- Reached from Landmark Detail ("View on Map") or Tour Detail ("Start Tour")
- Colored markers for landmarks by category (civic, residential, religious, commercial, educational)
- Tour route polylines shown when opened from a tour
- Bottom sheet with landmark quick-preview when marker tapped
- "My Location" button
- Back navigation returns to the landmark/tour the user came from

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

### Flow 1: Read the Landmarks
1. User opens app → Landmarks screen (the book's index)
2. User taps an entry → Landmark Detail with history, photos, and BAHA notes
3. User taps "View on Map" → Pushes Map screen centered on that landmark
4. Back returns to the detail page

### Flow 2: Read a Tour (Chapter)
1. User taps Tours tab → Book-style list of walking tours
2. User taps a tour → Tour Detail with stops
3. User taps "Start Tour" → Pushes Map screen with tour route highlighted and stops numbered

### Flow 3: Search Landmarks
1. User taps Landmarks tab → Full list with search bar
2. User types architect name or landmark name → Filtered results
3. User taps a landmark → Landmark Detail screen

## Tab Bar Configuration
| Tab | Icon | Label |
|-----|------|-------|
| Landmarks | `building.columns.fill` / `account-balance` | Landmarks |
| Tours | `figure.walk` / `directions-walk` | Tours |
