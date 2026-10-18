/**
 * Wires lib/queryCache.ts's `persist` option to AsyncStorage. Imported once
 * from app/_layout.tsx (kept out of queryCache.ts so its tests run in Node).
 * Only public CMS content is persisted; health data belongs in
 * lib/secureStorage.ts instead.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { configureQueryPersistence } from "./queryCache";

configureQueryPersistence(AsyncStorage);
