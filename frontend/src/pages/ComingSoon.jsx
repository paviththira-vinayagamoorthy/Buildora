import { Construction } from "lucide-react";

export default function ComingSoon({ title }) {
  return (
    <div className="min-h-[calc(100vh-80px)] bg-[#FAF6F0] p-8 lg:p-10">

      <div className="mx-auto max-w-6xl">

        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#D87963]">
          Buildora Workspace
        </p>

        <h1 className="mt-2 text-3xl font-extrabold text-[#302536]">
          {title}
        </h1>

        <div className="mt-8 flex min-h-[420px] flex-col items-center justify-center rounded-[26px] border border-[#E9DED5] bg-[#FFFCF8] p-8 text-center shadow-sm">

          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#F1E8EE] text-[#6C405F]">
            <Construction size={28} />
          </div>

          <h2 className="mt-5 text-xl font-bold text-[#302536]">
            {title} is coming soon
          </h2>

          <p className="mt-2 max-w-md text-sm leading-6 text-[#817980]">
            This module is planned for the next Buildora development phase.
          </p>

        </div>

      </div>

    </div>
  );
}