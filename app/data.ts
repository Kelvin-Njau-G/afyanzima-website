import type { StaticImageData } from 'next/image';

import Placeholder from '@/images/artboard.png';
import Dense from '@/images/pharmacies/dense.jpg';
import Healmerc from '@/images/pharmacies/healmerc.jpg';
import NdipoPharm from '@/images/pharmacies/ndipo-pharm.jpg';
import Pharmtech from '@/images/pharmacies/pharmtech.jpg';
import Qaalane from '@/images/pharmacies/qaalane.jpg';
import WellLiving from '@/images/well-living-updated.jpeg';

export type Pharmacy = {
  /** Short id, also used as the map pin key. */
  key: string;
  name: string;
  image: StaticImageData;
  location: string;
  /** Written the way it should appear on the site, e.g. "0716 911 038". */
  phoneNumber: string;
  hours: string;
  directions: string;
  /** Map pin position. In Google Maps, press and hold on the spot to copy these. */
  lat: number;
  lng: number;
};

/**
 * The single list of AfyaNzima pharmacies.
 * Both the pharmacy cards and the map pins read from here, so adding,
 * removing or editing a pharmacy is a change to this list only.
 */
export const pharmacies: Pharmacy[] = [
  {
    key: 'qaalane',
    name: 'Qaalane Pharmacy and Medical Centre',
    image: Qaalane,
    location: 'Eastleigh, 2nd Street',
    phoneNumber: '0716 911 038',
    hours: '24/7',
    directions: 'https://maps.app.goo.gl/CjZ9p7N6vL1zGvpt9',
    lat: -1.2787967,
    lng: 36.8490987,
  },
  {
    key: 'healmerc',
    name: 'Healmerc Pharmacy',
    image: Healmerc,
    location: 'Chokaa, Kangundo Road, opposite Chokamatt Supermarket',
    phoneNumber: '0182 687 909',
    hours: '8:00am - 11:00pm',
    directions: 'https://maps.app.goo.gl/2FJzUtZUDHdKKo9X7',
    lat: -1.250372,
    lng: 36.952885,
  },
  {
    key: 'pharmtech',
    name: 'Pharmtech Global Pharmacy',
    image: Pharmtech,
    location: 'Kayole Junction, opposite Shell fuel station',
    phoneNumber: '0180 955 882',
    hours: '8:00am - 11:00pm',
    directions: 'https://maps.app.goo.gl/4YVPEkY7HE65H8db9',
    lat: -1.2569382,
    lng: 36.9226521,
  },
  {
    key: 'dense',
    name: 'Dense Pharmacy',
    image: Dense,
    location: 'Kariobangi, at the Stage Roundabout',
    phoneNumber: '0182 654 873',
    hours: '8:00am - 11:00pm',
    directions: 'https://maps.app.goo.gl/3y5Um7Cqf7rjgmd97',
    lat: -1.2617964,
    lng: 36.8786669,
  },
  {
    key: 'ndipo',
    name: 'Ndipo Pharm Pharmacy',
    image: NdipoPharm,
    location: 'Mlolongo',
    phoneNumber: '0181 999 357',
    hours: '8:00am - 11:00pm',
    directions: 'https://maps.app.goo.gl/Av8PzM7wNNRUeBam9',
    lat: -1.3927459,
    lng: 36.9386413,
  },
  {
    key: 'wellLiving',
    name: 'Well Living Medical Clinic',
    image: WellLiving,
    location: 'Kayole, Mihango stage',
    phoneNumber: '0741 779 592',
    hours: '8:00am - 10:00pm',
    directions: 'https://maps.app.goo.gl/t7VJbr26JcgV4rR1A',
    lat: -1.2638497181444144,
    lng: 36.926983666913614,
  },
  {
    key: 'libken',
    name: 'Libken Medical Centre',
    image: Placeholder,
    location: 'Eastleigh, Second Avenue',
    phoneNumber: '0143 898 296',
    hours: '24/7',
    directions: 'https://maps.app.goo.gl/vXQSYzkgzYCuWPRk8',
    lat: -1.2778697,
    lng: 36.8490787,
  },
  {
    key: 'deboMart',
    name: 'DeboMart Medical Centre',
    image: Placeholder,
    location: 'Bahati, along Heshima Avenue',
    phoneNumber: '0184 428 041',
    hours: '8:00am - 11:00pm',
    directions: 'https://maps.app.goo.gl/JGK2XQcaRDa4Jaxu5',
    lat: -1.291928,
    lng: 36.8544991,
  },
  {
    key: 'palms',
    name: 'Palms Chemist',
    image: Placeholder,
    location: 'Makongeni, Thika, opposite Madaraka Market',
    phoneNumber: '0185 112 219',
    hours: '24/7',
    directions: 'https://maps.app.goo.gl/MxDeRhTZ1VQ1XiG59',
    lat: -1.0575001,
    lng: 37.1120014,
  },
];

/** "0716 911 038" → "tel:+254716911038", so the number can be tapped to call. */
export function telLink(phone: string) {
  const digits = phone.replace(/\D/g, '');
  return `tel:+254${digits.replace(/^(254|0)/, '')}`;
}
