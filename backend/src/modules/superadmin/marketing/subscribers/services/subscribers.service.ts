import * as repo from "../repositories/subscribers.repository.js";

type SubscriberFilters = {
  search?: string;
  type?: "newsletter" | "early_interest" | "guide_lead";
};

export async function listSubscribers(limit: number, offset: number, filters: SubscriberFilters) {
  return repo.listSubscribers(limit, offset, filters);
}

export async function countSubscribers(filters: SubscriberFilters) {
  return repo.countSubscribers(filters);
}
