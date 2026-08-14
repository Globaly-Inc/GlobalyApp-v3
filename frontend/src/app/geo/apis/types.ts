export type Country = {
  id: number;
  name: string;
  iso2: string;
  phoneCode: string | null;
};

export type City = {
  id: number;
  name: string;
  stateName: string | null;
};
