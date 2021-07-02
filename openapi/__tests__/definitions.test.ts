import { CreatedMessageWithContent } from "../../generated/definitions/CreatedMessageWithContent";
import { CreatedMessageWithoutContent } from "../../generated/definitions/CreatedMessageWithoutContent";
import { HiddenServicePayload } from "../../generated/definitions/HiddenServicePayload";
import { ServicePayload } from "../../generated/definitions/ServicePayload";
import { VisibleServicePayload } from "../../generated/definitions/VisibleServicePayload";

import { toString } from "fp-ts/lib/function";
import { FiscalCode } from "../../generated/definitions/FiscalCode";
import { PaymentData } from "../../generated/definitions/PaymentData";
import { OrganizationFiscalCode } from "../../generated/definitions/OrganizationFiscalCode";
import { PaymentAmount } from "../../generated/definitions/PaymentAmount";
import { PaymentNoticeNumber } from "../../generated/definitions/PaymentNoticeNumber";
import { Payee } from "../../generated/definitions/Payee";
import { MessageContent } from "../../generated/definitions/MessageContent";
import { NewMessage } from "../../generated/definitions/NewMessage";
import { PaymentDataWithExplicitPayee } from "../../generated/definitions/PaymentDataWithExplicitPayee";

describe("ServicePayload definition", () => {
  const commonServicePayload = {
    authorized_cidrs: [],
    department_name: "Department Name",
    organization_fiscal_code: "12345678901",
    organization_name: "Organization Name",
    require_secure_channels: true,
    service_name: "Service Name",
    version: 0
  };

  const visibleService = {
    ...commonServicePayload,
    is_visible: true,
    service_metadata: {
      address: "address",
      app_android: "app",
      app_ios: "app",
      cta: "cta",
      description: "Description",
      email: "test@mail.it",
      pec: "pec@mail.it",
      phone: "333",
      privacy_url: "http://privateurl.it",
      scope: "LOCAL",
      support_url: "http://supporturl.it",
      token_name: "token",
      tos_url: "http://weburlk.it",
      web_url: "http://weburl.it"
    }
  };

  const hiddenService = {
    ...commonServicePayload,
    is_visible: false
  };

  const hiddenServiceWithoutIsVisible = {
    ...commonServicePayload
  };

  const invalidService = {
    is_visible: true,
    service_metadata: {
      address: "address",
      app_android: "app",
      app_ios: "app",
      cta: "cta",
      description: "Description",
      email: "test@mail.it",
      pec: "pec@mail.it",
      phone: "333",
      privacy_url: "http://privateurl.it",
      scope: "LOCAL",
      support_url: "http://supporturl.it",
      token_name: "token",
      tos_url: "http://weburlk.it",
      web_url: "http://weburl.it"
    }
  };

  it("should decode visibleService with VisibleService and ServicePayload", () => {
    const servicePayloadTest = ServicePayload.decode(visibleService);
    const visibleServiceTest = VisibleServicePayload.decode(visibleService);
    const hiddenServiceTest = HiddenServicePayload.decode(visibleService);

    expect(servicePayloadTest.isRight()).toBe(true);
    expect(visibleServiceTest.isRight()).toBe(true);
    expect(hiddenServiceTest.isLeft()).toBe(true);
  });

  it("should decode hiddenService with HiddenService and ServicePayload", () => {
    const servicePayloadTest = ServicePayload.decode(hiddenService);
    const visibleServiceTest = VisibleServicePayload.decode(hiddenService);
    const hiddenServiceTest = HiddenServicePayload.decode(hiddenService);

    expect(servicePayloadTest.isRight()).toBe(true);
    expect(visibleServiceTest.isLeft()).toBe(true);
    expect(hiddenServiceTest.isRight()).toBe(true);
  });

  it("should not decode invalidService with HiddenService, ServicePayload and VisibleServicePayload", () => {
    const servicePayloadTest = ServicePayload.decode(invalidService);
    const visibleServiceTest = VisibleServicePayload.decode(invalidService);
    const hiddenServiceTest = HiddenServicePayload.decode(invalidService);

    expect(servicePayloadTest.isLeft()).toBe(true);
    expect(visibleServiceTest.isLeft()).toBe(true);
    expect(hiddenServiceTest.isLeft()).toBe(true);
  });

  it("should decode hiddenServiceWithoutIsVisible with HiddenService and ServicePayload", () => {
    const servicePayloadTest = ServicePayload.decode(
      hiddenServiceWithoutIsVisible
    );
    const visibleServiceTest = VisibleServicePayload.decode(
      hiddenServiceWithoutIsVisible
    );
    const hiddenServiceTest = HiddenServicePayload.decode(
      hiddenServiceWithoutIsVisible
    );

    expect(servicePayloadTest.isRight()).toBe(true);
    expect(visibleServiceTest.isLeft()).toBe(true);
    expect(hiddenServiceTest.isRight()).toBe(true);
  });
});

const aFiscalCode = "FRLFRC74E04B157I" as FiscalCode;
const anOrganizationFiscalCode = "12345678901" as OrganizationFiscalCode;
const aDate = new Date();
const aNewMessageWithoutContent = {
  fiscal_code: aFiscalCode
};
const aMessageWithoutContent = {
  id: "A_MESSAGE_ID",
  fiscal_code: aFiscalCode,
  created_at: aDate,
  sender_service_id: "test"
};

const aCountentWithoutPaymentData = {
  subject:
    "A Subject of more than 80 characters. Try to reach this value with stupid words, and I will leave here because I like it",
  markdown:
    "A markdown of more than 80 characters. Try to reach this value with stupid words, and I will leave here because I like it"
};

const aPaymentDataWithoutPayee: PaymentData = {
  amount: 1000 as PaymentAmount,
  notice_number: "177777777777777777" as PaymentNoticeNumber
};

const aPayee: Payee = { fiscal_code: anOrganizationFiscalCode };

describe("NewMessage definition", () => {
  it("should decode NewMessage with content but without payment data", () => {
    const aMessageWithContentWithoutPaymentData = {
      ...aNewMessageWithoutContent,
      content: aCountentWithoutPaymentData
    };

    expect(MessageContent.decode(aCountentWithoutPaymentData).isRight()).toBe(
      true
    );

    const messageWithContent = NewMessage.decode(
      aMessageWithContentWithoutPaymentData
    );

    expect(messageWithContent.isRight()).toBe(true);
    expect(messageWithContent.value).toEqual({
      ...aMessageWithContentWithoutPaymentData,
      time_to_live: 3600
    });
  });

  it("should decode NewMessage with content and payment data but without payee", () => {
    const aMessageWithContentWithPaymentDataWithoutPayee = {
      ...aNewMessageWithoutContent,
      content: {
        ...aCountentWithoutPaymentData,
        payment_data: aPaymentDataWithoutPayee
      }
    };

    const messageWithContent = NewMessage.decode(
      aMessageWithContentWithPaymentDataWithoutPayee
    );

    expect(messageWithContent.isRight()).toBe(true);
    expect(messageWithContent.value).toEqual({
      ...aMessageWithContentWithPaymentDataWithoutPayee,
      content: {
        ...aMessageWithContentWithPaymentDataWithoutPayee.content,
        payment_data: {
          ...aMessageWithContentWithPaymentDataWithoutPayee.content
            .payment_data,
          invalid_after_due_date: false
        }
      },
      time_to_live: 3600
    });
  });

  it("should decode PaymentDataWithExplicitPayee with payment data with payee", () => {
    const aPaymentDataWithPaye = { ...aPaymentDataWithoutPayee, payee: aPayee };

    const messageWithContent = PaymentDataWithExplicitPayee.decode(
      aPaymentDataWithPaye
    );

    expect(messageWithContent.isRight()).toBe(true);
    expect(messageWithContent.value).toEqual({
      ...aPaymentDataWithPaye,
      invalid_after_due_date: false
    });
  });

  it("should decode NewMessage with content and payment data with payee", () => {
    const aMessageWithContentWithPaymentDataWithPayee = {
      ...aMessageWithoutContent,
      content: {
        ...aCountentWithoutPaymentData,
        payment_data: { ...aPaymentDataWithoutPayee, payee: aPayee }
      }
    };

    expect(
      PaymentData.decode(
        aMessageWithContentWithPaymentDataWithPayee.content.payment_data
      ).isRight()
    ).toBe(true);

    const messageWithContent = NewMessage.decode(
      aMessageWithContentWithPaymentDataWithPayee
    );

    expect(messageWithContent.isRight()).toBe(true);
  });
});

describe("CreatedMessageWithContent definition", () => {
  it("should decode CreatedMessageWithContent with content and payment data with payee", () => {
    const aMessageWithContentWithPaymentDataWithoutPayee = {
      ...aMessageWithoutContent,
      content: {
        ...aCountentWithoutPaymentData,
        payment_data: { ...aPaymentDataWithoutPayee, payee: aPayee }
      }
    };

    expect(
      Payee.decode(
        aMessageWithContentWithPaymentDataWithoutPayee.content.payment_data
          .payee
      ).isRight()
    ).toBe(true);

    const messageWithContent = CreatedMessageWithContent.decode(
      aMessageWithContentWithPaymentDataWithoutPayee
    );

    expect(messageWithContent.isRight()).toBe(true);
  });

  it("should NOT decode CreatedMessageWithContent with content and payment data without payee", () => {
    const aMessageWithContentWithPaymentDataWithoutPayee = {
      ...aMessageWithoutContent,
      content: {
        ...aCountentWithoutPaymentData,
        payment_data: { ...aPaymentDataWithoutPayee }
      }
    };

    const messageWithContent = CreatedMessageWithContent.decode(
      aMessageWithContentWithPaymentDataWithoutPayee
    );

    expect(messageWithContent.isLeft()).toBe(true);
  });
});

describe("Type definition", () => {
  it("should decode MessageContent with content without payment data", () => {
    const decodedMessageContent = MessageContent.decode(
      aCountentWithoutPaymentData
    );

    expect(decodedMessageContent.isRight()).toBe(true);
    decodedMessageContent;

    expect(decodedMessageContent.value).toBe(aCountentWithoutPaymentData);
  });

  it("should decode PaymentData without payee", () => {
    const decodedPaymentData = PaymentData.decode(aPaymentDataWithoutPayee);

    expect(decodedPaymentData.isRight()).toBe(true);
    expect(decodedPaymentData.value).toEqual({
      ...aPaymentDataWithoutPayee,
      invalid_after_due_date: false
    });
  });
});
