"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import type { Call } from "@/types/database";

// Fix default marker icons for leaflet
const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

L.Marker.prototype.options.icon = defaultIcon;

interface CallsMapProps {
  calls: Call[];
}

export default function CallsMap({ calls }: CallsMapProps) {
  // Filter calls with valid coordinates
  const locatedCalls = calls.filter(
    (c) => c.latitude !== null && c.longitude !== null
  );

  // Calculate center of map (default to US center)
  const center: [number, number] =
    locatedCalls.length > 0
      ? [
          locatedCalls.reduce((sum, c) => sum + (c.latitude || 0), 0) / locatedCalls.length,
          locatedCalls.reduce((sum, c) => sum + (c.longitude || 0), 0) / locatedCalls.length,
        ]
      : [39.8283, -98.5795]; // US center

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "-";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (locatedCalls.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
        <p className="text-gray-400">No geolocated calls yet</p>
        <p className="text-gray-500 text-sm mt-2">
          Calls will appear on the map once their IP addresses are geolocated
        </p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="p-4 border-b border-gray-800">
        <p className="text-gray-400 text-sm">
          {locatedCalls.length} call{locatedCalls.length !== 1 ? "s" : ""} on map
        </p>
      </div>
      <MapContainer
        center={center}
        zoom={4}
        style={{ height: "500px", width: "100%" }}
        className="z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {locatedCalls.map((call) => (
          <Marker
            key={call.id}
            position={[call.latitude!, call.longitude!]}
          >
            <Popup>
              <div className="text-sm">
                <p className="font-medium">{call.city || "Unknown"}, {call.region || ""}</p>
                <p className="text-gray-600">{formatDate(call.created_at)}</p>
                <p className="text-gray-600">Duration: {formatDuration(call.duration_seconds)}</p>
                {call.quotable_quote && (
                  <p className="mt-2 italic text-green-700 text-xs">
                    &ldquo;{call.quotable_quote.slice(0, 100)}...&rdquo;
                  </p>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
