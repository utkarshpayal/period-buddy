import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppState } from "../../components/AppState";
import { useTheme } from "../../components/theme";

interface Doctor {
  id: string;
  name: string;
  specialty: string;
  rating: number;
  availability: string;
  price: string;
}

export default function Consultation() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const { earnTokens } = useAppState();
  const [searchQuery, setSearchQuery] = useState("");
  const [bookedDoctorIds, setBookedDoctorIds] = useState<Set<string>>(
    new Set(),
  );

  const doctors: Doctor[] = [
    {
      id: "1",
      name: "Dr. Sarah Johnson",
      specialty: "Gynecologist",
      rating: 4.8,
      availability: "Available today",
      price: "$45/session",
    },
    {
      id: "2",
      name: "Dr. Priya Sharma",
      specialty: "OBGYN",
      rating: 4.9,
      availability: "Tomorrow 2 PM",
      price: "$60/session",
    },
    {
      id: "3",
      name: "Dr. Maria Lopez",
      specialty: "Reproductive Health",
      rating: 4.7,
      availability: "Available today",
      price: "$50/session",
    },
  ];
  const filteredDoctors = doctors.filter((doctor) =>
    [doctor.name, doctor.specialty, doctor.availability]
      .join(" ")
      .toLowerCase()
      .includes(searchQuery.trim().toLowerCase()),
  );

  function bookDoctor(id: string) {
    if (bookedDoctorIds.has(id)) return;

    setBookedDoctorIds((current) => {
      const next = new Set(current);
      next.add(id);
      return next;
    });
    earnTokens(10);
  }

  return (
    <>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />

      <SafeAreaView
        className="flex-1"
        style={{ backgroundColor: colors.background }}
      >
        <ScrollView contentContainerClassName="pb-10">
          <View className="flex-row items-center gap-4 px-6 pt-6">
            <TouchableOpacity
              onPress={() => router.back()}
              accessibilityLabel="Back"
              style={{ padding: 8, margin: -8 }}
            >
              <Ionicons
                name="chevron-back"
                size={24}
                color={colors.foreground}
              />
            </TouchableOpacity>
            <Text
              className="flex-1 text-2xl font-bold"
              style={{ color: colors.foreground }}
            >
              Gynac Consultation
            </Text>
          </View>

          <View className="mx-6 mt-6">
            {/* Search Bar */}
            <View
              className="flex-row items-center rounded-xl border-2 px-4"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
              }}
            >
              <Ionicons name="search" size={20} color={colors.mutedText} />
              <TextInput
                placeholder="Find doctors..."
                placeholderTextColor={colors.mutedText}
                value={searchQuery}
                onChangeText={setSearchQuery}
                className="ml-3 flex-1 py-4 text-base"
                style={{ color: colors.foreground }}
              />
            </View>

            {/* Doctors List */}
            <View className="mt-6 gap-4">
              {filteredDoctors.map((doctor) => {
                const isBooked = bookedDoctorIds.has(doctor.id);

                return (
                  <View
                    key={doctor.id}
                    className="overflow-hidden rounded-xl border-2"
                    style={{
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    }}
                  >
                    <View className="flex-row items-start p-4">
                      <View
                        className="h-16 w-16 items-center justify-center rounded-full"
                        style={{ backgroundColor: colors.primary }}
                      >
                        <Ionicons
                          name="person-circle"
                          size={32}
                          color="white"
                        />
                      </View>

                      <View className="ml-4 flex-1">
                        <Text
                          className="font-bold"
                          style={{ color: colors.foreground }}
                        >
                          {doctor.name}
                        </Text>
                        <Text
                          className="mt-1 text-sm"
                          style={{ color: colors.mutedText }}
                        >
                          {doctor.specialty}
                        </Text>

                        <View className="mt-2 flex-row items-center gap-1">
                          <Ionicons
                            name="star"
                            size={14}
                            color={colors.accent}
                          />
                          <Text
                            className="text-xs font-semibold"
                            style={{ color: colors.foreground }}
                          >
                            {doctor.rating}
                          </Text>
                          <Text
                            className="text-xs"
                            style={{ color: colors.mutedText }}
                          >
                            • {doctor.availability}
                          </Text>
                        </View>
                      </View>

                      <Text
                        className="font-bold"
                        style={{ color: colors.primary }}
                      >
                        {doctor.price}
                      </Text>
                    </View>

                    <TouchableOpacity
                      activeOpacity={0.85}
                      disabled={isBooked}
                      className="mx-4 mb-4 rounded-lg py-3"
                      onPress={() => bookDoctor(doctor.id)}
                      style={{
                        backgroundColor: isBooked
                          ? colors.secondary
                          : colors.primary,
                        opacity: isBooked ? 0.8 : 1,
                      }}
                    >
                      <Text
                        className="text-center font-bold"
                        style={{ color: colors.buttonText }}
                      >
                        {isBooked ? "Consultation Booked" : "Book Consultation"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>

            <Text
              className="mt-6 text-xs text-center"
              style={{ color: colors.mutedText }}
            >
              All consultations are private and confidential
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
