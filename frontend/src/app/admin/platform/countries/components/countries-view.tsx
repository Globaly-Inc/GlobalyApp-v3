"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { AdminRecordsCard } from "../../../components/admin-placeholder-view";
import { fetchCountries } from "../store/countries-slice";
import { COUNTRY_COLUMNS } from "../const";

export function CountriesView() {
  const dispatch = useAppDispatch();
  const { countries } = useAppSelector((state) => state.platformCountries);

  useEffect(() => {
    dispatch(fetchCountries());
  }, [dispatch]);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Countries</h1>
        <p className="text-muted-foreground mt-1">Manage countries and cities available across the platform.</p>
      </div>

      <AdminRecordsCard columns={COUNTRY_COLUMNS} rows={countries} />
    </div>
  );
}
