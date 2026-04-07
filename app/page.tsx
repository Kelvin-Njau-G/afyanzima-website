import Image from 'next/image';
import { ArrowRightIcon, EnvelopeIcon, MapPinIcon, PhoneIcon } from '@heroicons/react/24/outline';

import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import Facebook from '@/components/icons/facebook';
import Instagram from '@/components/icons/instagram';
import LinkedIn from '@/components/icons/linkedIn';
import Maps from '@/components/maps';
import Maternal from '@/images/antenatal-postnatal.jpg';
import Artboard from '@/images/artboard.png';
import BabaDogo from '@/images/baba-dogo.png';
import PharmacistHero from '@/images/pharmacist-hero.png';
import Stocking from '@/images/stocking.png';
import Staffing from '@/images/staffing.png';
import Operations from '@/images/operations.png';
import Compliance from '@/images/compliance.png';
import BrandMarketing from '@/images/brand-marketing.png';
import HMIS from '@/images/hmis.png';
import Dawa from '@/images/dawa.png';
import EyeCare from '@/images/eye-care.png';
import FooterLogo from '@/images/footer_logo.png';
import LabServices from '@/images/Lab-services.jpg';
import SpecialistServices from '@/images/specialist-services.png';

import { facilities, pharmacies } from './data';

export default function Home() {
  return (
    <main>
      <section className="px-4 py-6 sm:p-14">
        <div className="mx-auto max-w-screen-2xl items-center max-sm:space-y-8 sm:flex sm:space-x-[7.125rem]">
          <div className="space-y-8 sm:w-[41.375rem] sm:space-y-[3.375rem]">
            <div className="space-y-8 tracking-[-0.06em] max-sm:text-center sm:space-y-[3.75rem]">
              <div className="flex-col items-center space-y-8 max-sm:flex">
                <h1 className="text-[2.5rem]/[3rem] font-bold text-[#066DB7] sm:text-5xl">The care you need, all under one roof.</h1>
                <div className="h-[0.3125rem] w-[5.6875rem] bg-[#066DB7]" />
              </div>
              <h1 className="text-3xl font-semibold text-[#E63524]">
                AfyaNzima partners with primary care clinics to manage on-site pharmacies, ensuring every patient leaves with their full prescription in hand.
              </h1>
              {/* --- UPDATED SECTION STARTS HERE --- */}
              <div className="grid grid-cols-1 gap-10 sm:grid-cols-2">
                {/* Left column - Patients */}
                <div className="space-y-6">
                  <h2 className="text-[2rem]/[2.5rem] font-bold text-[#066DB7] sm:text-3xl">
                    For Patients
                  </h2>
                  <p className="text-xl text-[#111827]">You can expect:</p>
                  <ul className="list-disc space-y-2 pl-6 text-xl text-[#111827]">
                    <li>Fully-stocked pharmacy</li>
                    <li>Professional and qualified staff</li>
                    <li>Affordable prices</li>
                  </ul>
                  <div>
                    <a
                      href="#pharmacies"
                      className="group inline-flex items-center space-x-4 rounded-full border border-blue-600 px-4 py-1 text-blue-900 hover:border-[#066DB7] hover:bg-[#066DB7] hover:text-white sm:px-6 sm:py-2"
                    >
                      <span className="text-xs font-bold leading-tight tracking-tight sm:text-lg">
                        See our locations
                      </span>
                      <div className="grid size-[1.625rem] place-items-center rounded-full bg-[#066DB7] text-white group-hover:bg-white group-hover:text-[#066DB7]">
                        <ArrowRightIcon className="size-4" />
                      </div>
                    </a>
                  </div>
                </div>
                {/* Right column - Providers */}
                <div className="space-y-6">
                  <h2 className="text-[2rem]/[2.5rem] font-bold text-[#066DB7] sm:text-3xl">
                    For Providers
                  </h2>
                  <p className="text-xl text-[#111827]">You can expect:</p>
                  <ul className="list-disc space-y-2 pl-6 text-xl text-[#111827]">
                    <li>End-to-end management</li>
                    <li>Free complimentary HMIS system</li>
                    <li>Higher earnings</li>
                  </ul>
                  <div>
                    <a
                      href="#patients"
                      className="group inline-flex items-center space-x-4 rounded-full border border-blue-600 px-4 py-1 text-blue-900 hover:border-[#066DB7] hover:bg-[#066DB7] hover:text-white sm:px-6 sm:py-2"
                    >
                      <span className="text-xs font-bold leading-tight tracking-tight sm:text-lg">
                        Learn more
                      </span>
                      <div className="grid size-[1.625rem] place-items-center rounded-full bg-[#066DB7] text-white group-hover:bg-white group-hover:text-[#066DB7]">
                        <ArrowRightIcon className="size-4" />
                      </div>
                    </a>
                  </div>
                </div>
              </div>
              {/* --- UPDATED SECTION ENDS HERE --- */}
            </div>
          </div>
          <div className="flex-1 overflow-hidden rounded-3xl">
            <div className="aspect-h-[629] aspect-w-[549] bg-gray-300">
              <Image src={PharmacistHero} alt="" fill className="object-cover" priority />
            </div>
          </div>
        </div>
      </section>
      <section className="px-4 sm:p-[2.625rem]" id="patients">
        <div className="mx-auto max-w-screen-2xl space-y-6 sm:space-y-[2.625rem]">
          <h2 className="text-center text-[2.5rem]/[3rem] font-bold tracking-[-0.06em] text-[#066DB7] sm:text-5xl">
            Our services
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-8">
            <Dialog>
              <DialogTrigger asChild>
                <div className="aspect-h-[110] aspect-w-[343] cursor-pointer overflow-hidden rounded-lg sm:aspect-h-[335] sm:aspect-w-[662]">
                  <Image src={Stocking} alt="" fill className="object-cover" />
                  <div className="bg-[linear-gradient(11deg,_rgba(17,_24,_39,_0.80)_8.85%,_rgba(3,_48,_81,_0.00)_99.44%)]" />
                  <div className="flex flex-col justify-end space-y-2 px-2 py-3 sm:space-y-6 sm:px-9 sm:py-11">
                    <div className="h-[0.3125rem] w-[5.6875rem] bg-white" />
                    <p className="text-lg/5 font-bold leading-none text-white sm:text-[2rem]">Stocking</p>
                  </div>
                </div>
              </DialogTrigger>
              <DialogContent className="overflow-hidden rounded-lg p-0 max-sm:max-w-[80vw] sm:max-w-screen-lg sm:rounded-3xl">
                <div className="items-center sm:flex">
                  <div className="flex-1">
                    <div className="aspect-h-9 aspect-w-16 bg-gray-300 sm:aspect-h-1 sm:aspect-w-1">
                      <Image src={Stocking} alt="" fill className="object-cover" />
                    </div>
                  </div>
                  <div className="space-y-4 px-16 text-[#066DB7] max-sm:px-4 max-sm:py-6 sm:w-[26rem] sm:space-y-8">
                    <p className="text-2xl font-bold sm:text-[2rem]/none">Stocking</p>
                    <p className="leading-[-0.06em] max-sm:text-sm">
                      Our pharmacies are fully-stocked with all essential medicines needed to treat all conditions expected in primary health care. 
                      We use advanced data techniques to plan for expected demand ensuring you are guaranteed to find the medication you need on our shelf, everytime you need it.
                      <br />
                      We enforce rigorous vetting of our suppliers and the medicines we purchase to ensure that only trusted-quality
                      medication gets to our patients.
                      <br />
                      <br />
                      <span className="italic">
                        Take the first step towards comprehensive care.{' '}
                        <span className="font-bold">Visit the nearest facility</span> to experience our one-stop approach to
                        healthcare or <span className="font-bold">contact us</span> {' '}
                        <span className="font-bold">0719 807 978</span> to speak to our representative.
                      </span>
                    </p>
                    <div className="h-0.5 w-16 rounded bg-[#066DB7]" />
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog>
              <DialogTrigger asChild>
                <div className="cursor-pointer overflow-hidden">
                  <div className="aspect-h-[110] aspect-w-[343] overflow-hidden rounded-lg sm:aspect-h-[335] sm:aspect-w-[662]">
                    <Image src={Operations} alt="" fill className="object-cover object-[83%]" />
                    <div className="bg-[linear-gradient(11deg,_rgba(17,_24,_39,_0.80)_8.85%,_rgba(3,_48,_81,_0.00)_99.44%)]" />
                    <div className="flex flex-col justify-end space-y-2 px-2 py-3 sm:space-y-6 sm:px-9 sm:py-11">
                      <div className="h-[0.3125rem] w-[5.6875rem] bg-white" />
                      <p className="text-lg/5 font-bold leading-none text-white sm:text-[2rem]">
                        Operations management <span className="font-normal"></span>
                      </p>
                    </div>
                  </div>
                </div>
              </DialogTrigger>
              <DialogContent className="overflow-hidden rounded-lg p-0 max-sm:max-w-[80vw] sm:max-w-screen-lg sm:rounded-3xl">
                <div className="items-center sm:flex">
                  <div className="flex-1">
                    <div className="aspect-h-9 aspect-w-16 bg-gray-300 sm:aspect-h-1 sm:aspect-w-1">
                      <Image src={Operations} alt="" fill className="object-cover object-[83%]" />
                    </div>
                  </div>
                  <div className="space-y-4 px-16 text-[#066DB7] max-sm:px-4 max-sm:py-6 sm:w-[26rem] sm:space-y-8">
                    <p className="text-2xl font-bold sm:text-[2rem]/none">
                      Pharmacy Operations <span className="font-normal"></span>
                    </p>
                    <p className="leading-[-0.06em] max-sm:text-sm">
                      From restocking to dispensing & billing, we handle end-to-end operations so you can be assured of great customer service that you can always count on.
                      <br />
                      <br />
                      <span className="italic">
                        We do the heavy lifting so our care provider partners don't have to.{' '}
                        <span className="font-bold">Contact us </span>today to discover how we can 
                        streamline your pharmacy operations while you focus on delivering great patient care.
                      </span>
                    </p>
                    <div className="h-0.5 w-16 rounded bg-[#066DB7]" />
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog>
              <DialogTrigger asChild>
                <div className="aspect-h-[110] aspect-w-[343] cursor-pointer overflow-hidden rounded-lg sm:aspect-h-[335] sm:aspect-w-[662]">
                  <Image src={Staffing} alt="" fill className="object-cover" />
                  <div className="bg-[linear-gradient(11deg,_rgba(17,_24,_39,_0.80)_8.85%,_rgba(3,_48,_81,_0.00)_99.44%)]" />
                  <div className="flex flex-col justify-end space-y-2 px-2 py-3 sm:space-y-6 sm:px-9 sm:py-11">
                    <div className="h-[0.3125rem] w-[5.6875rem] bg-white" />
                    <p className="text-lg/5 font-bold leading-none text-white sm:text-[2rem]">
                      Staffing <span className="font-normal"></span>
                    </p>
                  </div>
                </div>
              </DialogTrigger>
              <DialogContent className="overflow-hidden rounded-lg p-0 max-sm:max-w-[80vw] sm:max-w-screen-lg sm:rounded-3xl">
                <div className="items-center sm:flex">
                  <div className="flex-1">
                    <div className="aspect-h-9 aspect-w-16 bg-gray-300 sm:aspect-h-1 sm:aspect-w-1">
                      <Image src={Staffing} alt="" fill className="object-cover" />
                    </div>
                  </div>
                  <div className="space-y-4 px-16 text-[#066DB7] max-sm:px-4 max-sm:py-6 sm:w-[26rem] sm:space-y-8">
                    <p className="text-2xl font-bold sm:text-[2rem]/none">
                      Pharmacy staffing <span className="font-normal"></span>
                    </p>
                    <p className="leading-[-0.06em] max-sm:text-sm">
                      Our frontline heroes that serve our patients are everything to us, and we ensure our pharmacies are manned by the best.
                      We manage staffing across the whole cycle from recruitment & training, to shift and performance management. <br />
                      <br />
                      <span className="italic">
                        Experience great customer service. <span className="font-bold">Visit our facilities</span> today
                        for a taste of professional service.
                      </span>
                    </p>
                    <div className="h-0.5 w-16 rounded bg-[#066DB7]" />
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog>
              <DialogTrigger asChild>
                <div className="aspect-h-[110] aspect-w-[343] cursor-pointer overflow-hidden rounded-lg sm:aspect-h-[335] sm:aspect-w-[662]">
                  <Image src={Compliance} alt="" fill className="object-cover" />
                  <div className="bg-[linear-gradient(11deg,_rgba(17,_24,_39,_0.80)_8.85%,_rgba(3,_48,_81,_0.00)_99.44%)]" />
                  <div className="flex flex-col justify-end space-y-2 px-2 py-3 sm:space-y-6 sm:px-9 sm:py-11">
                    <div className="h-[0.3125rem] w-[5.6875rem] bg-white" />
                    <p className="text-lg/5 font-bold leading-none text-white sm:text-[2rem]">
                      Regulatory Compliance <span className="font-normal"></span>
                    </p>
                  </div>
                </div>
              </DialogTrigger>
              <DialogContent className="overflow-hidden rounded-lg p-0 max-sm:max-w-[80vw] sm:max-w-screen-lg sm:rounded-3xl">
                <div className="items-center sm:flex">
                  <div className="flex-1">
                    <div className="aspect-h-9 aspect-w-16 bg-gray-300 sm:aspect-h-1 sm:aspect-w-1">
                      <Image src={Compliance} alt="" fill className="object-cover" />
                    </div>
                  </div>
                  <div className="space-y-4 px-16 text-[#066DB7] max-sm:px-4 max-sm:py-6 sm:w-[26rem] sm:space-y-8">
                    <p className="text-2xl font-bold sm:text-[2rem]/none">
                      Regulatory Compliance <span className="font-normal"></span>
                    </p>
                    <p className="leading-[-0.06em] max-sm:text-sm">
                      All our pharmacies are licensed by relevant bodies and are staffed with qualified personnel. <br /> From PPB licensing to ongoing audits, we ensure full compliance and good dispensing practices 
                      are always observed.
                     <br />
                      <br />
                      <span className="italic">
                        Want the piece of mind of knowing every prescription dispensed is right? Reach out today. Let us make your pharmacy a centre of excellence.{' '}
                        <span className="font-bold">Contact us</span> on{' '}
                        <span className="font-bold">0719 807 978</span> to talk to our representantive.
                      </span>
                    </p>
                    <div className="h-0.5 w-16 rounded bg-[#066DB7]" />
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog>
              <DialogTrigger asChild>
                <div className="aspect-h-[110] aspect-w-[343] cursor-pointer overflow-hidden rounded-lg sm:aspect-h-[335] sm:aspect-w-[662]">
                  <Image src={HMIS} alt="" fill className="object-cover" />
                  <div className="bg-[linear-gradient(11deg,_rgba(17,_24,_39,_0.80)_8.85%,_rgba(3,_48,_81,_0.00)_99.44%)]" />
                  <div className="flex flex-col justify-end space-y-2 px-2 py-3 sm:space-y-6 sm:px-9 sm:py-11">
                    <div className="h-[0.3125rem] w-[5.6875rem] bg-white" />
                    <p className="text-lg/5 font-bold leading-none text-white sm:text-[2rem]">
                      HMIS <span className="font-normal"></span>
                    </p>
                  </div>
                </div>
              </DialogTrigger>
              <DialogContent className="overflow-hidden rounded-lg p-0 max-sm:max-w-[80vw] sm:max-w-screen-lg sm:rounded-3xl">
                <div className="items-center sm:flex">
                  <div className="flex-1">
                    <div className="aspect-h-9 aspect-w-16 bg-gray-300 sm:aspect-h-1 sm:aspect-w-1">
                      <Image src={HMIS} alt="" fill className="object-cover" />
                    </div>
                  </div>
                  <div className="space-y-4 px-16 text-[#066DB7] max-sm:px-4 max-sm:py-6 sm:w-[26rem] sm:space-y-8">
                    <p className="text-2xl font-bold sm:text-[2rem]/none">
                      HMIS <span className="font-normal"></span>
                    </p>
                    <p className="leading-[-0.06em] max-sm:text-sm">
                      We onboard the clinic to our Health Management Information System software free of charge to keep
                      neat patient histories and manage all clinic operations. <br />
                      <br />{' '}
                      <span className="italic">
                        Inject efficiency into your clinic's operations with our HMIS system.{' '}
                        <span className="font-bold">Reach out to us</span> on{' '}
                        <span className="font-bold">0719 807 978</span> to speak with our representantive.
                      </span>
                    </p>
                    <div className="h-0.5 w-16 rounded bg-[#066DB7]" />
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog>
              <DialogTrigger asChild>
                <div className="aspect-h-[110] aspect-w-[343] cursor-pointer overflow-hidden rounded-lg sm:aspect-h-[335] sm:aspect-w-[662]">
                  <Image src={BrandMarketing} alt="" fill className="object-cover" />
                  <div className="bg-[linear-gradient(11deg,_rgba(17,_24,_39,_0.80)_8.85%,_rgba(3,_48,_81,_0.00)_99.44%)]" />
                  <div className="flex flex-col justify-end space-y-2 px-2 py-3 sm:space-y-6 sm:px-9 sm:py-11">
                    <div className="h-[0.3125rem] w-[5.6875rem] bg-white" />
                    <p className="text-lg/5 font-bold leading-none text-white sm:text-[2rem]">
                      Brand Marketing <span className="font-normal"></span>
                    </p>
                  </div>
                </div>
              </DialogTrigger>
              <DialogContent className="overflow-hidden rounded-lg p-0 max-sm:max-w-[80vw] sm:max-w-screen-lg sm:rounded-3xl">
                <div className="items-center sm:flex">
                  <div className="flex-1">
                    <div className="aspect-h-9 aspect-w-16 bg-gray-300 sm:aspect-h-1 sm:aspect-w-1">
                      <Image src={BrandMarketing} alt="" fill className="object-cover" />
                    </div>
                  </div>
                  <div className="space-y-4 px-16 text-[#066DB7] max-sm:px-4 max-sm:py-6 sm:w-[26rem] sm:space-y-8">
                    <p className="text-2xl font-bold sm:text-[2rem]/none">
                      Brand Marketing <span className="font-normal"></span>
                    </p>
                    <p className="leading-[-0.06em] max-sm:text-sm">
                      We market our network through various online and offline channels. <br /> As part of the AfyaNzima network, you benefit from
                      all the visibility and brand awareness we create.
                      <br />
                      <br />
                      <span className="italic">
                        Join the network. <span className="font-bold">Talk to us </span>
                        today on <span className="font-bold">0719 807 978</span> .
                      </span>
                    </p>
                    <div className="h-0.5 w-16 rounded bg-[#066DB7]" />
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <div className="max-sm:space-y-6 sm:flex sm:space-x-[2.625rem]">
            <div className="flex-1 space-y-6 sm:space-y-[2.625rem]"></div>
          </div>
        </div>
      </section>
      <section className="bg-[#FFF6F5] px-4 py-12 sm:px-[4.5rem] sm:py-16" id="pharmacies">
        <div className="mx-auto max-w-screen-2xl space-y-12">
          <div className="space-y-8 text-center font-bold text-[#066DB7]">
            <h2 className="text-5xl tracking-[-0.06em]">AfyaNzima Pharmacies</h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-3 sm:gap-12">
            {pharmacies.map((pharmacy) => {
              const { name, location, phoneNumber, hours, image, insurance, directions } = pharmacy;

              return (
                <div
                  key={name}
                  className="rounded-2xl bg-white px-6 py-8 text-[#111827] shadow-[0px_4px_4px_0px_rgba(0,_0,_0,_0.10)]"
                >
                  <div className="flex-col space-y-6 sm:flex sm:h-full sm:justify-between">
                    <div className="aspect-h-[363] aspect-w-[350] overflow-hidden rounded-2xl bg-[#ededed]">
                      <Image src={image} alt="" fill className="object-cover" />
                    </div>
                    <p className="text-lg font-bold leading-none tracking-[-0.02em] text-[#066DB7] sm:text-2xl">
                      {name}
                    </p>
                    <ul className="space-y-2 font-bold text-[#111827]">
                      <li>
                        Location: <span className="font-normal">{location}</span>
                      </li>
                      <li>
                        Contact us: <span className="font-normal">{phoneNumber}</span>
                      </li>
                      <li>
                        Operating Hours: <span className="font-normal">{hours}</span>
                      </li>
                      <li>
                        Insurance: <span className="font-normal">{insurance}</span>
                      </li>
                    </ul>
                    <div>
                      <a
                        href={directions}
                        target="_blank"
                        rel="noopener"
                        className="group inline-flex items-center space-x-4 rounded-full border border-blue-600 px-4 py-1 text-blue-900 hover:border-[#066DB7] hover:bg-[#066DB7] hover:text-white sm:px-6 sm:py-2"
                      >
                        <span className="text-xs font-bold leading-tight tracking-tight sm:text-lg">
                          Get directions
                        </span>
                        <div className="grid size-[1.625rem] place-items-center rounded-full bg-[#066DB7] text-white group-hover:bg-white group-hover:text-[#066DB7]">
                          <ArrowRightIcon className="size-4" />
                        </div>
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
      
      <Maps />
      
      <section className="bg-[#F6F8FF] px-4 py-16 sm:px-[4.5rem]" id="providers">
        <div className="mx-auto max-w-screen-2xl space-y-12">
          <div className="space-y-6 text-[#066DB7]">
            <h2 className="text-center text-5xl font-bold tracking-[-0.02em]">
              Join our growing network of partner facilities
            </h2>
          </div>
          <a
            className="group block space-y-6 rounded-2xl bg-white p-8 text-[#066DB7] shadow-[-2px_4px_16px_0px_rgba(0,_0,_0,_0.05)] hover:bg-[#066DB7] hover:text-white sm:text-lg/[auto]"
            href="https://forms.gle/BdG57rrBpMAgxgB8A"
            target="_blank"
            rel="noopener"
          >
            <h3 className="text-2xl font-bold tracking-[-0.02em] sm:text-[2rem]/none">Pharmacy as a Service</h3>
            <p>
              In this model, we operate your clinic pharmacy for you, giving you peace of mind as you focus on the
              management and clinical care provided in the rest of your facility. 
            </p>
              <div className="flex items-center space-x-4">
              <p className="font-bold tracking-[-0.02em]">Reach out to us</p>
              <div className="grid size-[1.625rem] place-items-center rounded-full bg-[#066DB7] text-lg/5 text-white group-hover:bg-white group-hover:text-[#066DB7]">
                <ArrowRightIcon className="size-4" />
              </div>
            </div>
          </a>
          <p className="text-center font-bold tracking-[-0.02em] text-[#066DB7] max-sm:p-8 sm:text-[1.75rem]/8">
            We can tailor the offering to the clinic&apos;s exact needs - whether it is dealing with financial
            management, staff (training) or aspiration to grow with new offerings. As each clinic has different needs,
            we welcome you to reach out to discuss what a potential partnership could look like. 
          </p>
        </div>
      </section>
      <footer className="bg-[#E63524] px-4 py-6 text-white sm:p-12">
        <div className="mx-auto max-w-screen-2xl">
          <div className="mb-6 w-[9.4375rem] sm:mb-8">
            <div className="aspect-h-[61] aspect-w-[151]">
              <Image src={FooterLogo} alt="" fill />
            </div>
          </div>
          <div className="mb-6 w-[22rem] text-sm">
            <h3 className="mb-4 text-lg font-bold">Contact us</h3>
            <ul className="space-y-2 text-sm/4">
              <li className="flex items-center space-x-2">
                <PhoneIcon className="size-4" />
                <a href="tel:0727398172">0719 807 978</a>
              </li>
             
              <li className="flex items-center space-x-2">
                <EnvelopeIcon className="size-4" />
                <a href="mailto:afyanzima@ilarahealth.com" className="underline">
                  growth@tembelea.health
                </a>
              </li>
              <li className="flex items-center space-x-2">
                <MapPinIcon className="size-4" />
                <a
                  href="https://maps.app.goo.gl/rWAdaGxKtHKNVN5J6"
                  target="_blank"
                  rel="noopener"
                  className="underline"
                >
                  Lavington, Nairobi
                </a>
              </li>
            </ul>
          </div>
          <div className="items-center justify-between sm:flex">
            <div className="flex space-x-4 max-sm:mb-4">
              <h3>Follow us</h3>
              <ul className="flex space-x-2">
                <li>
                  <a
                    href="https://www.facebook.com/profile.php?id=61550628488398&mibextid=ZbWKwL"
                    target="_blank"
                    rel="noopener"
                  >
                    <Facebook className="size-6" />
                  </a>
                </li>
                
                <li>
                  <a href="https://www.instagram.com/afyanzimaclinics/" target="_blank" rel="noopener">
                    <Instagram className="size-6" />
                  </a>
                </li>
              </ul>
            </div>
            <p className="text-sm/4">&copy; {new Date().getFullYear()} Dhow Health Ltd.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
